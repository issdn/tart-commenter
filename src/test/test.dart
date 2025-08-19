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
