@deprecated
class RandomClass {
  @deprecated
  int value;

  RandomClass(this.value);

  int doubleValue() {
    return value * 2;
  }

  bool isEven() {
    return value % 2 == 0;
  }
}
