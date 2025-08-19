### Tart Commenter

Automatically generate {@template} comments for all public module members.

```dart
@deprecated
class RandomClass {
  @override
  @deprecated
  // ignore: override_on_non_overriding_member
  int value;

  RandomClass(this.value);

  int doubleValue(int value) {
    return value * 2;
  }

  @deprecated
  bool isEven() {
    return value % 2 == 0;
  }
}
```

to

```dart
/// {@template random_class}
/// {@endtemplate}
@deprecated
class RandomClass {
  @override
  @deprecated
  // ignore: override_on_non_overriding_member
  int value;

  /// {@macro random_class}
  RandomClass(this.value);

  /// {@template double_value}
  /// {@endtemplate}
  int doubleValue(int value) {
    return value * 2;
  }

  /// {@template is_even}
  /// {@endtemplate}
  @deprecated
  bool isEven() {
    return value % 2 == 0;
  }
}
```