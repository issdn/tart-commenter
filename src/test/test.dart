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
