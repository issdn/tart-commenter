### Tart Commenter

Automatically generate {@template} comments for all public module members.

```dart
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
```

to

```dart
/// {@template random_class}
/// {@endtemplate}
@deprecated
class RandomClass {
/// {@template value}
/// {@endtemplate}
  @deprecated
  int value;

/// {@macro random_class}
  RandomClass(this.value);

/// {@template double_value}
/// {@endtemplate}
  int doubleValue() {
    return value * 2;
  }

/// {@template is_even}
/// {@endtemplate}
  bool isEven() {
    return value % 2 == 0;
  }
}
```