# Appendix B: Formula Function Reference

Complete reference for all functions available in the QDesigner Modern formula engine.

---

## Mathematical Functions

### ABS

Returns the absolute value of a number.

**Syntax**: `ABS(value)`

| Parameter | Type | Description |
|---|---|---|
| value | number | Number to get absolute value of |

**Returns**: number

**Example**: `ABS(-5)` returns `5`

---

### ROUND

Rounds a number to the specified number of decimal places.

**Syntax**: `ROUND(value, decimals?)`

| Parameter | Type | Description |
|---|---|---|
| value | number | Number to round |
| decimals | number | Decimal places (default: 0) |

**Returns**: number

**Examples**:
- `ROUND(3.7)` returns `4`
- `ROUND(3.14159, 2)` returns `3.14`

---

### SQRT

Returns the square root of a number.

**Syntax**: `SQRT(value)`

| Parameter | Type | Description |
|---|---|---|
| value | number | Number to get square root of |

**Returns**: number

**Example**: `SQRT(16)` returns `4`

---

### POW

Returns the base raised to the exponent power.

**Syntax**: `POW(base, exponent)`

| Parameter | Type | Description |
|---|---|---|
| base | number | Base number |
| exponent | number | Exponent |

**Returns**: number

**Example**: `POW(2, 8)` returns `256`

---

### RANDOM

Returns a random number between 0 (inclusive) and 1 (exclusive). If a random seed is set in the formula context, the result is deterministic for reproducibility.

**Syntax**: `RANDOM()`

**Returns**: number

**Example**: `RANDOM()` returns e.g. `0.7342`

---

### RANDINT

Returns a random integer between min and max (inclusive).

**Syntax**: `RANDINT(min, max)`

| Parameter | Type | Description |
|---|---|---|
| min | number | Minimum value |
| max | number | Maximum value |

**Returns**: number

**Example**: `RANDINT(1, 6)` returns e.g. `4`

---

## Array Functions

### SUM

Returns the sum of all numeric values.

**Syntax**: `SUM(values...)` or `SUM(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Values to sum |

**Returns**: number

**Examples**:
- `SUM(1, 2, 3)` returns `6`
- `SUM([10, 20, 30])` returns `60`

---

### COUNT

Counts non-empty values (excludes null, undefined, and empty strings).

**Syntax**: `COUNT(values...)` or `COUNT(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...any or array | Values to count |

**Returns**: number

**Example**: `COUNT(1, null, 3, "", 5)` returns `3`

---

### MIN

Returns the minimum numeric value.

**Syntax**: `MIN(values...)` or `MIN(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Values to find minimum |

**Returns**: number (NaN if no numeric values)

**Example**: `MIN(5, 2, 8, 1)` returns `1`

---

### MAX

Returns the maximum numeric value.

**Syntax**: `MAX(values...)` or `MAX(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Values to find maximum |

**Returns**: number (NaN if no numeric values)

**Example**: `MAX(5, 2, 8, 1)` returns `8`

---

### FILTER

Filters array elements based on a condition.

**Syntax**: `FILTER(array, condition)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to filter |
| condition | string | Condition expression (e.g., `"> 3"`, `"!= banana"`) |

**Returns**: array

**Examples**:
- `FILTER([1, 2, 3, 4, 5], "> 3")` returns `[4, 5]`
- `FILTER(["apple", "banana", "cherry"], "!= banana")` returns `["apple", "cherry"]`

Supported operators: `>`, `>=`, `<`, `<=`, `==`, `=`, `!=`

---

### MAP

Transforms each element of an array using a mathematical operation.

**Syntax**: `MAP(array, transform)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to transform |
| transform | string | Operation expression (e.g., `"* 2"`, `"+ 10"`) |

**Returns**: array

**Examples**:
- `MAP([1, 2, 3], "* 2")` returns `[2, 4, 6]`
- `MAP([10, 20, 30], "+ 5")` returns `[15, 25, 35]`

Supported operators: `+`, `-`, `*`, `/`, `^`

---

### REDUCE

Reduces an array to a single value using a named operation.

**Syntax**: `REDUCE(array, operation, initial?)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to reduce |
| operation | string | `"sum"`, `"product"`, `"min"`, `"max"`, `"concat"`, `"count"` |
| initial | any | Initial accumulator value (optional) |

**Returns**: any

**Examples**:
- `REDUCE([1, 2, 3, 4], "sum")` returns `10`
- `REDUCE([5, 10, 15], "product")` returns `750`
- `REDUCE(["a", "b", "c"], "concat")` returns `"abc"`

---

### SORT

Sorts array elements in ascending or descending order.

**Syntax**: `SORT(array, order?)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to sort |
| order | string | `"asc"` (default) or `"desc"` |

**Returns**: array

**Examples**:
- `SORT([3, 1, 4, 1, 5])` returns `[1, 1, 3, 4, 5]`
- `SORT(["banana", "apple", "cherry"], "desc")` returns `["cherry", "banana", "apple"]`

---

### UNIQUE

Returns an array with duplicate values removed.

**Syntax**: `UNIQUE(array)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array with potential duplicates |

**Returns**: array

**Examples**:
- `UNIQUE([1, 2, 2, 3, 3, 3])` returns `[1, 2, 3]`
- `UNIQUE(["a", "b", "a", "c"])` returns `["a", "b", "c"]`

---

### FLATTEN

Flattens nested arrays to the specified depth.

**Syntax**: `FLATTEN(array, depth?)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Nested array to flatten |
| depth | number | Depth to flatten (default: 1) |

**Returns**: array

**Examples**:
- `FLATTEN([[1, 2], [3, 4]])` returns `[1, 2, 3, 4]`
- `FLATTEN([1, [2, [3, 4]]], 2)` returns `[1, 2, 3, 4]`

---

### GROUP_BY

Groups an array of objects by a property value.

**Syntax**: `GROUP_BY(array, property)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array of objects |
| property | string | Property name to group by |

**Returns**: object (keys are property values, values are arrays of matching objects)

**Example**: `GROUP_BY([{name: "Alice", age: 25}, {name: "Bob", age: 25}], "age")` returns `{"25": [{name: "Alice", age: 25}, {name: "Bob", age: 25}]}`

---

### PLUCK

Extracts a single property value from each object in an array.

**Syntax**: `PLUCK(array, property)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array of objects |
| property | string | Property to extract |

**Returns**: array

**Example**: `PLUCK([{name: "Alice", age: 25}, {name: "Bob", age: 30}], "name")` returns `["Alice", "Bob"]`

---

### SLICE

Extracts a portion of an array.

**Syntax**: `SLICE(array, start, end?)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to slice |
| start | number | Start index (0-based) |
| end | number | End index (exclusive, optional) |

**Returns**: array

**Examples**:
- `SLICE([1, 2, 3, 4, 5], 1, 4)` returns `[2, 3, 4]`
- `SLICE(["a", "b", "c", "d"], 2)` returns `["c", "d"]`

---

### REVERSE

Returns the array in reversed order.

**Syntax**: `REVERSE(array)`

| Parameter | Type | Description |
|---|---|---|
| array | array | Array to reverse |

**Returns**: array

**Example**: `REVERSE([1, 2, 3])` returns `[3, 2, 1]`

---

## Logical Functions

### IF

Evaluates a condition and returns one of two values.

**Syntax**: `IF(condition, trueValue, falseValue)`

| Parameter | Type | Description |
|---|---|---|
| condition | boolean | Condition to test |
| trueValue | any | Value if condition is true |
| falseValue | any | Value if condition is false |

**Returns**: any

**Example**: `IF(score > 80, "Pass", "Fail")`

---

### AND

Returns true if all arguments are truthy.

**Syntax**: `AND(values...)`

| Parameter | Type | Description |
|---|---|---|
| values | ...boolean | Values to AND |

**Returns**: boolean

**Example**: `AND(true, true, false)` returns `false`

---

### OR

Returns true if at least one argument is truthy.

**Syntax**: `OR(values...)`

| Parameter | Type | Description |
|---|---|---|
| values | ...boolean | Values to OR |

**Returns**: boolean

**Example**: `OR(false, true, false)` returns `true`

---

### NOT

Returns the logical negation.

**Syntax**: `NOT(value)`

| Parameter | Type | Description |
|---|---|---|
| value | boolean | Value to negate |

**Returns**: boolean

**Example**: `NOT(true)` returns `false`

---

## Text Functions

### CONCAT

Concatenates all arguments into a single string.

**Syntax**: `CONCAT(values...)`

| Parameter | Type | Description |
|---|---|---|
| values | ...any | Values to concatenate |

**Returns**: string

**Example**: `CONCAT("Hello", " ", "World")` returns `"Hello World"`

---

### LENGTH

Returns the length of a string.

**Syntax**: `LENGTH(text)`

| Parameter | Type | Description |
|---|---|---|
| text | string | Text to measure |

**Returns**: number

**Example**: `LENGTH("Hello")` returns `5`

---

### UPPER

Converts a string to uppercase.

**Syntax**: `UPPER(text)`

| Parameter | Type | Description |
|---|---|---|
| text | string | Text to convert |

**Returns**: string

**Example**: `UPPER("hello")` returns `"HELLO"`

---

### LOWER

Converts a string to lowercase.

**Syntax**: `LOWER(text)`

| Parameter | Type | Description |
|---|---|---|
| text | string | Text to convert |

**Returns**: string

**Example**: `LOWER("HELLO")` returns `"hello"`

---

## Date/Time Functions

### NOW

Returns the current timestamp in milliseconds since the Unix epoch. Uses the formula context's `currentTime` if set.

**Syntax**: `NOW()`

**Returns**: number

**Example**: `NOW()` returns e.g. `1709312400000`

---

### TIME_SINCE

Returns the elapsed time in milliseconds since a given timestamp.

**Syntax**: `TIME_SINCE(timestamp)`

| Parameter | Type | Description |
|---|---|---|
| timestamp | number | Start timestamp in milliseconds |

**Returns**: number

**Example**: `TIME_SINCE(startTime)` returns e.g. `5432`

---

## Statistical Functions

### MEAN

Calculates the arithmetic mean (average) of numeric values.

**Syntax**: `MEAN(values...)` or `MEAN(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to average |

**Returns**: number (NaN if no numeric values)

**Examples**:
- `MEAN(1, 2, 3, 4, 5)` returns `3`
- `MEAN([10, 20, 30])` returns `20`

---

### MEDIAN

Calculates the median (middle value) of numeric values.

**Syntax**: `MEDIAN(values...)` or `MEDIAN(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to find median |

**Returns**: number

**Examples**:
- `MEDIAN(1, 3, 5, 7, 9)` returns `5`
- `MEDIAN([2, 4, 6, 8])` returns `5` (average of 4 and 6)

---

### MODE

Finds the most frequently occurring value(s).

**Syntax**: `MODE(values...)` or `MODE(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...any or array | Values to analyze |

**Returns**: any (single value if one mode, array if multiple modes)

**Example**: `MODE(1, 2, 2, 3, 3, 3)` returns `3`

---

### STDEV

Calculates the sample standard deviation.

**Syntax**: `STDEV(values...)` or `STDEV(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to calculate standard deviation |

**Returns**: number (NaN if fewer than 2 values)

**Example**: `STDEV(1, 2, 3, 4, 5)` returns approximately `1.58`

---

### VARIANCE

Calculates the sample variance.

**Syntax**: `VARIANCE(values...)` or `VARIANCE(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to calculate variance |

**Returns**: number (NaN if fewer than 2 values)

**Example**: `VARIANCE(1, 2, 3, 4, 5)` returns `2.5`

---

### PERCENTILE

Calculates the nth percentile of a numeric array.

**Syntax**: `PERCENTILE(values, percentile)`

| Parameter | Type | Description |
|---|---|---|
| values | array | Array of numbers |
| percentile | number | Percentile value (0-1 or 0-100) |

**Returns**: number

Values between 0 and 1 are used directly. Values between 1 and 100 are automatically divided by 100.

**Examples**:
- `PERCENTILE([1, 2, 3, 4, 5], 0.5)` returns `3`
- `PERCENTILE([10, 20, 30, 40], 75)` returns `32.5`

---

### CORRELATION

Calculates the Pearson correlation coefficient between two arrays of numbers.

**Syntax**: `CORRELATION(x, y)`

| Parameter | Type | Description |
|---|---|---|
| x | array | First array of numbers |
| y | array | Second array of numbers |

**Returns**: number between -1 and 1 (NaN if arrays differ in length or have fewer than 2 elements)

**Examples**:
- `CORRELATION([1, 2, 3], [2, 4, 6])` returns `1` (perfect positive)
- `CORRELATION([1, 2, 3], [3, 2, 1])` returns `-1` (perfect negative)

---

### ZSCORE

Calculates the z-score (standard score) of a value relative to a population.

**Syntax**: `ZSCORE(value, mean, stdev)`

| Parameter | Type | Description |
|---|---|---|
| value | number | Value to standardize |
| mean | number | Population mean |
| stdev | number | Population standard deviation |

**Returns**: number (NaN if stdev is 0)

**Example**: `ZSCORE(85, 80, 10)` returns `0.5`

---

### TTEST

Performs an independent samples t-test between two groups.

**Syntax**: `TTEST(group1, group2, tails?)`

| Parameter | Type | Description |
|---|---|---|
| group1 | array | First group of numbers |
| group2 | array | Second group of numbers |
| tails | number | Number of tails: 1 or 2 (default: 2) |

**Returns**: object with `t`, `df`, `mean1`, `mean2`, `meanDiff`, `se`, `effectSize` (Cohen's d)

**Example**:
```
TTEST([80, 85, 90], [75, 78, 82])
```
Returns:
```json
{
  "t": 1.73,
  "df": 4,
  "mean1": 85.0,
  "mean2": 78.33,
  "meanDiff": 6.67,
  "se": 3.85,
  "effectSize": 1.41
}
```

---

### SKEWNESS

Calculates the skewness of a distribution. Indicates asymmetry.

**Syntax**: `SKEWNESS(values...)` or `SKEWNESS(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to analyze |

**Returns**: number (NaN if fewer than 3 values, or if standard deviation is 0)

- Positive skewness: right tail is longer.
- Negative skewness: left tail is longer.
- Zero: symmetric distribution.

**Example**: `SKEWNESS(1, 2, 3, 4, 5)` returns `0` (symmetric)

---

### KURTOSIS

Calculates the excess kurtosis of a distribution. Indicates the "tailedness" relative to a normal distribution.

**Syntax**: `KURTOSIS(values...)` or `KURTOSIS(array)`

| Parameter | Type | Description |
|---|---|---|
| values | ...number or array | Numbers to analyze |

**Returns**: number (NaN if fewer than 4 values)

- Positive (leptokurtic): heavier tails than normal.
- Negative (platykurtic): lighter tails than normal.
- Zero (mesokurtic): similar to normal distribution.

**Example**: `KURTOSIS(1, 2, 3, 4, 5)` returns `-1.3` (platykurtic)

---

## Operators

In addition to functions, formulas support standard mathematical operators:

| Operator | Description | Example |
|---|---|---|
| `+` | Addition | `a + b` |
| `-` | Subtraction | `a - b` |
| `*` | Multiplication | `a * b` |
| `/` | Division | `a / b` |
| `^` | Exponentiation | `a ^ 2` |
| `>` | Greater than | `score > 80` |
| `>=` | Greater or equal | `score >= 80` |
| `<` | Less than | `score < 50` |
| `<=` | Less or equal | `score <= 50` |
| `==` | Equal | `status == "complete"` |
| `!=` | Not equal | `status != "pending"` |

---

## Variable References

Formulas can reference other variables by name. The formula engine resolves variable references at evaluation time.

**Syntax**: Use the variable name directly in the formula.

**Example**: If a variable named `total_score` has value `85`, the formula `total_score / 100` evaluates to `0.85`.

### Variable Interpolation

In text contexts, variables can be interpolated using double-brace syntax:

```
Your score is {{total_score}} out of 100.
```

---

## Formula Syntax Notes

- Formulas can optionally start with `=` (the leading equals sign is stripped).
- Function names are case-insensitive (`SUM`, `sum`, and `Sum` all work).
- Results are cached until the formula context changes.
- Evaluation performance is tracked via `executionTime` in the result.
