import 'dart:convert';
import 'dart:io';
import 'package:analyzer/dart/analysis/features.dart';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/source/line_info.dart';

class PublicMemberVisitor extends RecursiveAstVisitor<void> {
  final List<Map<String, Object>> offsets = [];
  final LineInfo lineInfo;
  final String content;
  String? currentClassName;

  PublicMemberVisitor(this.lineInfo, this.content);

  Declaration _getFullRegionFromVariableDeclaration(Declaration node) {
    dynamic parent = node;
    do {
      parent = parent.parent;
    } while (parent is VariableDeclaration ||
        parent is VariableDeclarationList);
    return parent as Declaration;
  }

  bool _isPublic(String name) => !name.startsWith('_');

  bool _hasTemplate(Comment? comment) {
    if (comment == null) return false;
    final text = comment.tokens.map((t) => t.lexeme).join(' ');
    return text.contains('@template') || text.contains('@macro');
  }

  bool _hasOverride(NodeList<Annotation> annotations) {
    return annotations.any(
      (annotation) =>
          annotation.name.name == 'override' ||
          annotation.name.name == 'Override',
    );
  }

  int _getOffsetAboveDecorators(
    AstNode node,
    NodeList<Annotation> annotations,
  ) {
    if (annotations.isEmpty) {
      return node.offset;
    }

    final firstAnnotationOffset = annotations.first.offset;
    final firstAnnotationLine = lineInfo
        .getLocation(firstAnnotationOffset)
        .lineNumber;

    int lineAboveOffset = 0;
    if (firstAnnotationLine > 1) {
      lineAboveOffset = lineInfo.getOffsetOfLine(firstAnnotationLine - 1);
    }

    if (lineAboveOffset > 0) {
      return lineAboveOffset + firstAnnotationOffset - lineAboveOffset;
    }

    return firstAnnotationOffset;
  }

  void _addMember(
    AstNode node, {
    NodeList<Annotation>? annotations,
    Comment? comment,
    required String name,
    bool shouldMacro = false,
  }) {
    if (comment != null && _hasTemplate(comment)) return;
    if (annotations != null && _hasOverride(annotations)) return;

    final offset = annotations != null && annotations.isNotEmpty
        ? _getOffsetAboveDecorators(node, annotations)
        : node.offset;

    offsets.add({"name": name, "offset": offset, "shouldMacro": shouldMacro});
  }

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    if (_isPublic(node.name.lexeme)) {
      currentClassName = node.name.lexeme;
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name.lexeme,
      );
    }
    super.visitClassDeclaration(node);
  }

  @override
  void visitMixinDeclaration(MixinDeclaration node) {
    if (_isPublic(node.name.lexeme)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name.lexeme,
      );
    }
    super.visitMixinDeclaration(node);
  }

  @override
  void visitEnumDeclaration(EnumDeclaration node) {
    if (_isPublic(node.name.lexeme)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name.lexeme,
      );
    }
    super.visitEnumDeclaration(node);
  }

  @override
  void visitExtensionDeclaration(ExtensionDeclaration node) {
    if (node.name != null && _isPublic(node.name!.lexeme)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name!.lexeme,
      );
    }
    super.visitExtensionDeclaration(node);
  }

  @override
  void visitConstructorDeclaration(ConstructorDeclaration node) {
    final constructorName = node.name?.lexeme ?? currentClassName;
    final shouldMacro = node.name?.lexeme == null;

    if (constructorName != null && _isPublic(constructorName)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: constructorName,
        shouldMacro: shouldMacro,
      );
    }
    super.visitConstructorDeclaration(node);
  }

  @override
  void visitMethodDeclaration(MethodDeclaration node) {
    if (_isPublic(node.name.lexeme)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name.lexeme,
      );
    }
    super.visitMethodDeclaration(node);
  }

  @override
  void visitFieldDeclaration(FieldDeclaration node) {
    for (final variable in node.fields.variables) {
      if (_isPublic(variable.name.lexeme)) {
        _addMember(
          _getFullRegionFromVariableDeclaration(variable),
          annotations: node.metadata,
          comment: node.documentationComment,
          name: variable.name.lexeme,
        );
      }
    }
    super.visitFieldDeclaration(node);
  }

  @override
  void visitTopLevelVariableDeclaration(TopLevelVariableDeclaration node) {
    for (final variable in node.variables.variables) {
      if (_isPublic(variable.name.lexeme)) {
        _addMember(
          _getFullRegionFromVariableDeclaration(variable),
          annotations: node.metadata,
          comment: node.documentationComment,
          name: variable.name.lexeme,
        );
      }
    }
    super.visitTopLevelVariableDeclaration(node);
  }

  @override
  void visitFunctionDeclaration(FunctionDeclaration node) {
    if (_isPublic(node.name.lexeme)) {
      _addMember(
        node,
        annotations: node.metadata,
        comment: node.documentationComment,
        name: node.name.lexeme,
      );
    }
    super.visitFunctionDeclaration(node);
  }
}

void main(List<String> args) async {
  if (args.isEmpty) {
    stderr.writeln('Usage: dart script.dart <dart_file>');
    exit(1);
  }

  final file = File(args[0]);
  if (!await file.exists()) {
    stderr.writeln('File not found: ${args[0]}');
    exit(1);
  }

  final content = await file.readAsString();
  final result = parseString(
    content: content,
    featureSet: FeatureSet.latestLanguageVersion(),
  );

  final visitor = PublicMemberVisitor(result.lineInfo, content);
  result.unit.accept(visitor);

  print(JsonEncoder().convert(visitor.offsets));
}
