import type { HelpEntry } from './types';

export const formulaReferenceEntries: HelpEntry[] = [
	// ========================================================================
	// Math Functions
	// ========================================================================
	{
		key: 'formulas.math.ABS',
		title: 'ABS(value)',
		description:
			'Returns the absolute value of a number.\n\n' +
			'**Parameters:**\n' +
			'- `value` (number) -- The number to get the absolute value of\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `ABS(-5)` returns `5`',
		category: 'formulas',
		tags: ['abs', 'absolute', 'math', 'number']
	},
	{
		key: 'formulas.math.ROUND',
		title: 'ROUND(value, decimals?)',
		description:
			'Rounds a number to the specified number of decimal places.\n\n' +
			'**Parameters:**\n' +
			'- `value` (number) -- The number to round\n' +
			'- `decimals` (number, optional) -- Decimal places (default: 0)\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `ROUND(3.14159, 2)` returns `3.14`',
		category: 'formulas',
		tags: ['round', 'decimal', 'math', 'precision']
	},
	{
		key: 'formulas.math.SQRT',
		title: 'SQRT(value)',
		description:
			'Returns the square root of a number.\n\n' +
			'**Parameters:**\n' +
			'- `value` (number) -- The number to get the square root of\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `SQRT(16)` returns `4`',
		category: 'formulas',
		tags: ['sqrt', 'square root', 'math']
	},
	{
		key: 'formulas.math.POW',
		title: 'POW(base, exponent)',
		description:
			'Returns the base raised to the power of the exponent.\n\n' +
			'**Parameters:**\n' +
			'- `base` (number) -- The base number\n' +
			'- `exponent` (number) -- The exponent\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `POW(2, 3)` returns `8`',
		category: 'formulas',
		tags: ['pow', 'power', 'exponent', 'math']
	},
	{
		key: 'formulas.math.RANDOM',
		title: 'RANDOM()',
		description:
			'Returns a random number between 0 (inclusive) and 1 (exclusive). If a random seed is set in the context, produces deterministic pseudo-random values.\n\n' +
			'**Parameters:** none\n\n' +
			'**Returns:** number (0 to 1)\n\n' +
			'**Example:** `RANDOM()` returns e.g. `0.7342`',
		category: 'formulas',
		tags: ['random', 'chance', 'math']
	},
	{
		key: 'formulas.math.RANDINT',
		title: 'RANDINT(min, max)',
		description:
			'Returns a random integer between min and max (inclusive).\n\n' +
			'**Parameters:**\n' +
			'- `min` (number) -- Minimum value (inclusive)\n' +
			'- `max` (number) -- Maximum value (inclusive)\n\n' +
			'**Returns:** number (integer)\n\n' +
			'**Example:** `RANDINT(1, 6)` returns a value from 1 to 6 (like a die roll)',
		category: 'formulas',
		tags: ['random', 'integer', 'dice', 'math']
	},

	// ========================================================================
	// Array Functions
	// ========================================================================
	{
		key: 'formulas.array.SUM',
		title: 'SUM(values...)',
		description:
			'Returns the sum of all numeric values. Accepts an array or individual arguments.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to sum\n\n' +
			'**Returns:** number\n\n' +
			'**Examples:**\n' +
			'- `SUM(1, 2, 3)` returns `6`\n' +
			'- `SUM([10, 20, 30])` returns `60`',
		category: 'formulas',
		tags: ['sum', 'total', 'add', 'array']
	},
	{
		key: 'formulas.array.COUNT',
		title: 'COUNT(values...)',
		description:
			'Counts non-empty values. Null, undefined, and empty strings are excluded.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...any) -- Values to count\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `COUNT(1, "", 3, null, 5)` returns `3`',
		category: 'formulas',
		tags: ['count', 'length', 'size', 'array']
	},
	{
		key: 'formulas.array.MIN',
		title: 'MIN(values...)',
		description:
			'Returns the smallest numeric value. Non-numeric values are ignored.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to search\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `MIN(5, 2, 8, 1, 9)` returns `1`',
		category: 'formulas',
		tags: ['min', 'minimum', 'smallest', 'array']
	},
	{
		key: 'formulas.array.MAX',
		title: 'MAX(values...)',
		description:
			'Returns the largest numeric value. Non-numeric values are ignored.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to search\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `MAX(5, 2, 8, 1, 9)` returns `9`',
		category: 'formulas',
		tags: ['max', 'maximum', 'largest', 'array']
	},
	{
		key: 'formulas.array.FILTER',
		title: 'FILTER(array, condition)',
		description:
			'Filters array elements based on a condition string.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to filter\n' +
			'- `condition` (string) -- Condition expression (e.g., "> 3", "!= banana")\n\n' +
			'**Returns:** array\n\n' +
			'**Examples:**\n' +
			'- `FILTER([1, 2, 3, 4, 5], "> 3")` returns `[4, 5]`\n' +
			'- `FILTER(["apple", "banana", "cherry"], "!= banana")` returns `["apple", "cherry"]`',
		category: 'formulas',
		tags: ['filter', 'where', 'condition', 'array']
	},
	{
		key: 'formulas.array.MAP',
		title: 'MAP(array, transform)',
		description:
			'Transforms each element of an array using a simple arithmetic expression.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to transform\n' +
			'- `transform` (string) -- Arithmetic expression (e.g., "* 2", "+ 10")\n\n' +
			'**Returns:** array\n\n' +
			'**Examples:**\n' +
			'- `MAP([1, 2, 3], "* 2")` returns `[2, 4, 6]`\n' +
			'- `MAP([10, 20, 30], "+ 5")` returns `[15, 25, 35]`',
		category: 'formulas',
		tags: ['map', 'transform', 'apply', 'array']
	},
	{
		key: 'formulas.array.REDUCE',
		title: 'REDUCE(array, operation, initial?)',
		description:
			'Reduces an array to a single value using a named operation.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to reduce\n' +
			'- `operation` (string) -- One of: "sum", "product", "min", "max", "concat", "count"\n' +
			'- `initial` (any, optional) -- Initial accumulator value\n\n' +
			'**Returns:** any\n\n' +
			'**Examples:**\n' +
			'- `REDUCE([1, 2, 3, 4], "sum")` returns `10`\n' +
			'- `REDUCE([5, 10, 15], "product")` returns `750`\n' +
			'- `REDUCE(["a", "b", "c"], "concat")` returns `"abc"`',
		category: 'formulas',
		tags: ['reduce', 'aggregate', 'fold', 'array']
	},
	{
		key: 'formulas.array.SORT',
		title: 'SORT(array, order?)',
		description:
			'Sorts array elements in ascending or descending order.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to sort\n' +
			'- `order` (string, optional) -- "asc" (default) or "desc"\n\n' +
			'**Returns:** array\n\n' +
			'**Examples:**\n' +
			'- `SORT([3, 1, 4, 1, 5])` returns `[1, 1, 3, 4, 5]`\n' +
			'- `SORT(["banana", "apple", "cherry"], "desc")` returns `["cherry", "banana", "apple"]`',
		category: 'formulas',
		tags: ['sort', 'order', 'arrange', 'array']
	},
	{
		key: 'formulas.array.UNIQUE',
		title: 'UNIQUE(array)',
		description:
			'Returns an array with duplicate values removed.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- Array with potential duplicates\n\n' +
			'**Returns:** array\n\n' +
			'**Example:** `UNIQUE([1, 2, 2, 3, 3, 3])` returns `[1, 2, 3]`',
		category: 'formulas',
		tags: ['unique', 'distinct', 'deduplicate', 'array']
	},
	{
		key: 'formulas.array.FLATTEN',
		title: 'FLATTEN(array, depth?)',
		description:
			'Flattens nested arrays into a single-level array.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- Nested array to flatten\n' +
			'- `depth` (number, optional) -- Depth to flatten (default: 1)\n\n' +
			'**Returns:** array\n\n' +
			'**Examples:**\n' +
			'- `FLATTEN([[1, 2], [3, 4]])` returns `[1, 2, 3, 4]`\n' +
			'- `FLATTEN([1, [2, [3, 4]]], 2)` returns `[1, 2, 3, 4]`',
		category: 'formulas',
		tags: ['flatten', 'nested', 'array']
	},
	{
		key: 'formulas.array.GROUP_BY',
		title: 'GROUP_BY(array, property)',
		description:
			'Groups an array of objects by a shared property value.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- Array of objects\n' +
			'- `property` (string) -- Property name to group by\n\n' +
			'**Returns:** object (keys are property values, values are arrays of matching objects)\n\n' +
			'**Example:** `GROUP_BY([{name: "Alice", age: 25}, {name: "Bob", age: 25}], "age")`',
		category: 'formulas',
		tags: ['group', 'categorize', 'partition', 'array', 'object']
	},
	{
		key: 'formulas.array.PLUCK',
		title: 'PLUCK(array, property)',
		description:
			'Extracts a single property value from each object in an array.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- Array of objects\n' +
			'- `property` (string) -- Property to extract\n\n' +
			'**Returns:** array\n\n' +
			'**Example:** `PLUCK([{name: "Alice", age: 25}, {name: "Bob", age: 30}], "name")` returns `["Alice", "Bob"]`',
		category: 'formulas',
		tags: ['pluck', 'extract', 'property', 'array', 'object']
	},
	{
		key: 'formulas.array.SLICE',
		title: 'SLICE(array, start, end?)',
		description:
			'Extracts a portion of an array by index.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to slice\n' +
			'- `start` (number) -- Start index (0-based, inclusive)\n' +
			'- `end` (number, optional) -- End index (exclusive)\n\n' +
			'**Returns:** array\n\n' +
			'**Example:** `SLICE([1, 2, 3, 4, 5], 1, 4)` returns `[2, 3, 4]`',
		category: 'formulas',
		tags: ['slice', 'subset', 'range', 'array']
	},
	{
		key: 'formulas.array.REVERSE',
		title: 'REVERSE(array)',
		description:
			'Returns the array in reverse order.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- The array to reverse\n\n' +
			'**Returns:** array\n\n' +
			'**Example:** `REVERSE([1, 2, 3])` returns `[3, 2, 1]`',
		category: 'formulas',
		tags: ['reverse', 'flip', 'array']
	},
	{
		key: 'formulas.array.FOREACH',
		title: 'FOREACH(array, callback)',
		description:
			'Executes a callback for each element in an array. Returns the number of elements processed.\n\n' +
			'**Parameters:**\n' +
			'- `array` (array) -- Array to iterate over\n' +
			'- `callback` (function) -- Function called for each element with (item, index)\n\n' +
			'**Returns:** number (count of elements processed)\n\n' +
			'**Example:** `FOREACH(RANGE(1, 5), (item) => SET("var_" + item, item * 10))`',
		category: 'formulas',
		tags: ['foreach', 'iterate', 'loop', 'array']
	},
	{
		key: 'formulas.array.RANGE',
		title: 'RANGE(start, end, step?)',
		description:
			'Generates a sequence of numbers.\n\n' +
			'**Parameters:**\n' +
			'- `start` (number) -- Start value (inclusive)\n' +
			'- `end` (number) -- End value (exclusive)\n' +
			'- `step` (number, optional) -- Step increment (default: 1)\n\n' +
			'**Returns:** array of numbers\n\n' +
			'**Examples:**\n' +
			'- `RANGE(1, 5)` returns `[1, 2, 3, 4]`\n' +
			'- `RANGE(0, 10, 2)` returns `[0, 2, 4, 6, 8]`\n' +
			'- `RANGE(5, 0, -1)` returns `[5, 4, 3, 2, 1]`',
		category: 'formulas',
		tags: ['range', 'sequence', 'generate', 'array']
	},

	// ========================================================================
	// Logical Functions
	// ========================================================================
	{
		key: 'formulas.logical.IF',
		title: 'IF(condition, trueValue, falseValue)',
		description:
			'Returns one value if the condition is true, and another if false. Can be nested for multiple conditions.\n\n' +
			'**Parameters:**\n' +
			'- `condition` (boolean) -- Condition to test\n' +
			'- `trueValue` (any) -- Value returned if condition is true\n' +
			'- `falseValue` (any) -- Value returned if condition is false\n\n' +
			'**Returns:** any\n\n' +
			'**Examples:**\n' +
			'- `IF(score > 80, "Pass", "Fail")` returns `"Pass"` or `"Fail"`\n' +
			'- `IF(age >= 18, IF(consent, "Eligible", "No consent"), "Too young")`',
		category: 'formulas',
		tags: ['if', 'conditional', 'ternary', 'logical']
	},
	{
		key: 'formulas.logical.AND',
		title: 'AND(values...)',
		description:
			'Returns true only if all arguments are truthy.\n\n' +
			'**Parameters:**\n' +
			'- `values` (...boolean) -- Values to test\n\n' +
			'**Returns:** boolean\n\n' +
			'**Example:** `AND(age >= 18, consent == true, NOT(excluded))` returns `true` only if all conditions are met',
		category: 'formulas',
		tags: ['and', 'all', 'every', 'logical']
	},
	{
		key: 'formulas.logical.OR',
		title: 'OR(values...)',
		description:
			'Returns true if at least one argument is truthy.\n\n' +
			'**Parameters:**\n' +
			'- `values` (...boolean) -- Values to test\n\n' +
			'**Returns:** boolean\n\n' +
			'**Example:** `OR(group == "A", group == "B")` returns `true` if group is A or B',
		category: 'formulas',
		tags: ['or', 'any', 'some', 'logical']
	},
	{
		key: 'formulas.logical.NOT',
		title: 'NOT(value)',
		description:
			'Returns the logical negation of a value.\n\n' +
			'**Parameters:**\n' +
			'- `value` (boolean) -- Value to negate\n\n' +
			'**Returns:** boolean\n\n' +
			'**Example:** `NOT(isExcluded)` returns `true` if `isExcluded` is false',
		category: 'formulas',
		tags: ['not', 'negate', 'inverse', 'logical']
	},

	// ========================================================================
	// Text Functions
	// ========================================================================
	{
		key: 'formulas.text.CONCAT',
		title: 'CONCAT(values...)',
		description:
			'Concatenates all arguments into a single string.\n\n' +
			'**Parameters:**\n' +
			'- `values` (...any) -- Values to concatenate (non-strings are converted)\n\n' +
			'**Returns:** string\n\n' +
			'**Example:** `CONCAT("Score: ", score, "/", maxScore)` returns e.g. `"Score: 85/100"`',
		category: 'formulas',
		tags: ['concat', 'join', 'string', 'text', 'combine']
	},
	{
		key: 'formulas.text.LENGTH',
		title: 'LENGTH(text)',
		description:
			'Returns the length of a string.\n\n' +
			'**Parameters:**\n' +
			'- `text` (string) -- Text to measure\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `LENGTH("hello")` returns `5`',
		category: 'formulas',
		tags: ['length', 'size', 'characters', 'string', 'text']
	},
	{
		key: 'formulas.text.UPPER',
		title: 'UPPER(text)',
		description:
			'Converts text to uppercase.\n\n' +
			'**Parameters:**\n' +
			'- `text` (string) -- Text to convert\n\n' +
			'**Returns:** string\n\n' +
			'**Example:** `UPPER("hello")` returns `"HELLO"`',
		category: 'formulas',
		tags: ['upper', 'uppercase', 'capitalize', 'string', 'text']
	},
	{
		key: 'formulas.text.LOWER',
		title: 'LOWER(text)',
		description:
			'Converts text to lowercase.\n\n' +
			'**Parameters:**\n' +
			'- `text` (string) -- Text to convert\n\n' +
			'**Returns:** string\n\n' +
			'**Example:** `LOWER("HELLO")` returns `"hello"`',
		category: 'formulas',
		tags: ['lower', 'lowercase', 'string', 'text']
	},

	// ========================================================================
	// Date/Time Functions
	// ========================================================================
	{
		key: 'formulas.time.NOW',
		title: 'NOW()',
		description:
			'Returns the current timestamp in milliseconds since epoch. Uses the context time if available (for deterministic testing).\n\n' +
			'**Parameters:** none\n\n' +
			'**Returns:** number (milliseconds)\n\n' +
			'**Example:** `NOW()` returns e.g. `1709654400000`',
		category: 'formulas',
		tags: ['now', 'current', 'time', 'timestamp', 'date']
	},
	{
		key: 'formulas.time.TIME_SINCE',
		title: 'TIME_SINCE(timestamp)',
		description:
			'Returns the time elapsed since the given timestamp, in milliseconds.\n\n' +
			'**Parameters:**\n' +
			'- `timestamp` (number) -- Start timestamp in milliseconds\n\n' +
			'**Returns:** number (milliseconds elapsed)\n\n' +
			'**Example:** `TIME_SINCE(sessionStartTime)` returns the number of milliseconds since the session started',
		category: 'formulas',
		tags: ['time', 'since', 'elapsed', 'duration', 'date']
	},

	// ========================================================================
	// Statistical Functions
	// ========================================================================
	{
		key: 'formulas.stat.MEAN',
		title: 'MEAN(values...)',
		description:
			'Calculates the arithmetic mean (average) of numeric values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to average\n\n' +
			'**Returns:** number\n\n' +
			'**Examples:**\n' +
			'- `MEAN(1, 2, 3, 4, 5)` returns `3`\n' +
			'- `MEAN([10, 20, 30])` returns `20`',
		category: 'formulas',
		tags: ['mean', 'average', 'avg', 'stat']
	},
	{
		key: 'formulas.stat.MEDIAN',
		title: 'MEDIAN(values...)',
		description:
			'Returns the median (middle) value. For even-length arrays, returns the average of the two middle values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to find the median of\n\n' +
			'**Returns:** number\n\n' +
			'**Examples:**\n' +
			'- `MEDIAN(1, 3, 5, 7, 9)` returns `5`\n' +
			'- `MEDIAN([2, 4, 6, 8])` returns `5` (average of 4 and 6)',
		category: 'formulas',
		tags: ['median', 'middle', 'stat']
	},
	{
		key: 'formulas.stat.MODE',
		title: 'MODE(values...)',
		description:
			'Returns the most frequently occurring value. If multiple values share the highest frequency, returns an array of all modes.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...any) -- Values to analyze\n\n' +
			'**Returns:** any or array\n\n' +
			'**Example:** `MODE(1, 2, 2, 3, 3, 3)` returns `3`',
		category: 'formulas',
		tags: ['mode', 'frequent', 'common', 'stat']
	},
	{
		key: 'formulas.stat.STDEV',
		title: 'STDEV(values...)',
		description:
			'Calculates the sample standard deviation (using N-1 denominator). Requires at least 2 values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to compute standard deviation of\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `STDEV(10, 12, 15, 18, 20)` returns approximately `4.18`',
		category: 'formulas',
		tags: ['stdev', 'standard deviation', 'spread', 'dispersion', 'stat']
	},
	{
		key: 'formulas.stat.VARIANCE',
		title: 'VARIANCE(values...)',
		description:
			'Calculates the sample variance (using N-1 denominator). Requires at least 2 values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to compute variance of\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `VARIANCE(1, 2, 3, 4, 5)` returns `2.5`',
		category: 'formulas',
		tags: ['variance', 'spread', 'dispersion', 'stat']
	},
	{
		key: 'formulas.stat.PERCENTILE',
		title: 'PERCENTILE(values, percentile)',
		description:
			'Calculates the nth percentile using linear interpolation. Accepts percentile as 0-1 or 0-100.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array) -- Array of numbers\n' +
			'- `percentile` (number) -- Percentile (0-1 or 0-100)\n\n' +
			'**Returns:** number\n\n' +
			'**Examples:**\n' +
			'- `PERCENTILE([1, 2, 3, 4, 5], 0.5)` returns `3`\n' +
			'- `PERCENTILE([10, 20, 30, 40], 75)` returns `32.5`',
		category: 'formulas',
		tags: ['percentile', 'quantile', 'rank', 'stat']
	},
	{
		key: 'formulas.stat.CORRELATION',
		title: 'CORRELATION(x, y)',
		description:
			'Calculates the Pearson correlation coefficient between two arrays. Returns a value between -1 and 1.\n\n' +
			'**Parameters:**\n' +
			'- `x` (array) -- First array of numbers\n' +
			'- `y` (array) -- Second array of numbers (same length as x)\n\n' +
			'**Returns:** number (-1 to 1)\n\n' +
			'**Example:** `CORRELATION([1, 2, 3], [2, 4, 6])` returns `1` (perfect positive correlation)',
		category: 'formulas',
		tags: ['correlation', 'pearson', 'relationship', 'stat']
	},
	{
		key: 'formulas.stat.ZSCORE',
		title: 'ZSCORE(value, mean, stdev)',
		description:
			'Calculates the z-score (standard score), indicating how many standard deviations a value is from the mean.\n\n' +
			'**Parameters:**\n' +
			'- `value` (number) -- The value to standardize\n' +
			'- `mean` (number) -- Population mean\n' +
			'- `stdev` (number) -- Population standard deviation\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `ZSCORE(85, 80, 10)` returns `0.5` (half a standard deviation above the mean)',
		category: 'formulas',
		tags: ['zscore', 'z-score', 'standard', 'normalize', 'stat']
	},
	{
		key: 'formulas.stat.TTEST',
		title: 'TTEST(group1, group2, tails?)',
		description:
			'Performs an independent samples t-test between two groups. Returns an object with the t-statistic, degrees of freedom, group means, and effect size (Cohen\'s d).\n\n' +
			'**Parameters:**\n' +
			'- `group1` (array) -- First group of values\n' +
			'- `group2` (array) -- Second group of values\n' +
			'- `tails` (number, optional) -- 1 or 2 (default: 2)\n\n' +
			'**Returns:** object `{ t, df, mean1, mean2, meanDiff, se, effectSize }`\n\n' +
			'**Example:** `TTEST([80, 85, 90], [75, 78, 82])`',
		category: 'formulas',
		tags: ['ttest', 't-test', 'hypothesis', 'significance', 'stat']
	},
	{
		key: 'formulas.stat.SKEWNESS',
		title: 'SKEWNESS(values...)',
		description:
			'Calculates the skewness of a distribution. Positive values indicate right skew; negative values indicate left skew. Requires at least 3 values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to analyze\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `SKEWNESS(1, 2, 3, 4, 5)` returns approximately `0`',
		category: 'formulas',
		tags: ['skewness', 'skew', 'asymmetry', 'distribution', 'stat']
	},
	{
		key: 'formulas.stat.KURTOSIS',
		title: 'KURTOSIS(values...)',
		description:
			'Calculates the excess kurtosis of a distribution. Positive values indicate heavy tails; negative values indicate light tails (relative to normal). Requires at least 4 values.\n\n' +
			'**Parameters:**\n' +
			'- `values` (array or ...number) -- Values to analyze\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `KURTOSIS(1, 2, 3, 4, 5)` returns approximately `-1.3` (platykurtic)',
		category: 'formulas',
		tags: ['kurtosis', 'tails', 'distribution', 'shape', 'stat']
	},

	// ========================================================================
	// Psychometric Functions
	// ========================================================================
	{
		key: 'formulas.psychometric.SPLIT_HALF',
		title: 'SPLIT_HALF(items)',
		description:
			'Calculates split-half reliability with Spearman-Brown correction. Splits items into odd/even halves, correlates half-test scores, then applies the correction formula.\n\n' +
			'**Parameters:**\n' +
			'- `items` (array) -- 2D array where each row is a participant and each column is an item score\n\n' +
			'**Returns:** number (0 to 1)\n\n' +
			'**Example:** `SPLIT_HALF([[4,3,5,2],[3,4,4,3],[5,5,4,4]])`',
		category: 'formulas',
		tags: ['split-half', 'reliability', 'spearman-brown', 'psychometric']
	},
	{
		key: 'formulas.psychometric.KR20',
		title: 'KR20(items)',
		description:
			'Calculates Kuder-Richardson Formula 20 reliability for dichotomous (0/1) items. Equivalent to Cronbach\'s alpha for binary-scored items.\n\n' +
			'**Parameters:**\n' +
			'- `items` (array) -- 2D array of 0/1 scores (participants x items)\n\n' +
			'**Returns:** number (0 to 1)\n\n' +
			'**Example:** `KR20([[1,0,1,1],[1,1,0,1],[0,1,1,0]])`',
		category: 'formulas',
		tags: ['kr20', 'kuder-richardson', 'reliability', 'dichotomous', 'psychometric']
	},
	{
		key: 'formulas.psychometric.OMEGA',
		title: 'OMEGA(items)',
		description:
			'Calculates McDonald\'s omega reliability based on the average inter-item correlation. A modern alternative to Cronbach\'s alpha that does not assume tau-equivalence.\n\n' +
			'**Parameters:**\n' +
			'- `items` (array) -- 2D array of item scores (participants x items)\n\n' +
			'**Returns:** number (0 to 1)\n\n' +
			'**Example:** `OMEGA([[4,3,5,2],[3,4,4,3],[5,5,4,4]])`',
		category: 'formulas',
		tags: ['omega', 'mcdonald', 'reliability', 'internal consistency', 'psychometric']
	},
	{
		key: 'formulas.psychometric.SEM',
		title: 'SEM(reliability, sd)',
		description:
			'Calculates the Standard Error of Measurement, indicating the expected spread of observed scores around the true score.\n\n' +
			'**Formula:** SEM = sd * sqrt(1 - reliability)\n\n' +
			'**Parameters:**\n' +
			'- `reliability` (number) -- Reliability coefficient (0 to 1)\n' +
			'- `sd` (number) -- Standard deviation of scores\n\n' +
			'**Returns:** number\n\n' +
			'**Example:** `SEM(0.85, 15)` returns approximately `5.81`',
		category: 'formulas',
		tags: ['sem', 'standard error', 'measurement', 'precision', 'psychometric']
	},

	// ========================================================================
	// IRT Functions
	// ========================================================================
	{
		key: 'formulas.irt.IRT_1PL',
		title: 'IRT_1PL(theta, b)',
		description:
			'Calculates the probability of a correct response under the Rasch (1-parameter logistic) IRT model. Only item difficulty varies; discrimination is fixed at 1.\n\n' +
			'**Formula:** P = 1 / (1 + exp(-(theta - b)))\n\n' +
			'**Parameters:**\n' +
			'- `theta` (number) -- Person ability parameter\n' +
			'- `b` (number) -- Item difficulty parameter\n\n' +
			'**Returns:** number (probability 0 to 1)\n\n' +
			'**Example:** `IRT_1PL(0, 0)` returns `0.5` (ability equals difficulty)',
		category: 'formulas',
		tags: ['irt', 'rasch', '1pl', 'item response', 'probability', 'psychometric']
	},
	{
		key: 'formulas.irt.IRT_2PL',
		title: 'IRT_2PL(theta, a, b)',
		description:
			'Calculates the probability of a correct response under the 2-parameter logistic IRT model, which adds item discrimination.\n\n' +
			'**Formula:** P = 1 / (1 + exp(-a * (theta - b)))\n\n' +
			'**Parameters:**\n' +
			'- `theta` (number) -- Person ability parameter\n' +
			'- `a` (number) -- Item discrimination parameter\n' +
			'- `b` (number) -- Item difficulty parameter\n\n' +
			'**Returns:** number (probability 0 to 1)\n\n' +
			'**Example:** `IRT_2PL(1.5, 1.2, -0.5)`',
		category: 'formulas',
		tags: ['irt', '2pl', 'discrimination', 'item response', 'psychometric']
	},
	{
		key: 'formulas.irt.IRT_3PL',
		title: 'IRT_3PL(theta, a, b, c)',
		description:
			'Calculates the probability of a correct response under the 3-parameter logistic IRT model, which adds a guessing (pseudo-chance) parameter.\n\n' +
			'**Formula:** P = c + (1 - c) / (1 + exp(-a * (theta - b)))\n\n' +
			'**Parameters:**\n' +
			'- `theta` (number) -- Person ability parameter\n' +
			'- `a` (number) -- Item discrimination parameter\n' +
			'- `b` (number) -- Item difficulty parameter\n' +
			'- `c` (number) -- Guessing parameter (0 to <1)\n\n' +
			'**Returns:** number (probability c to 1)\n\n' +
			'**Example:** `IRT_3PL(0, 1, 0, 0.25)` returns `0.625`',
		category: 'formulas',
		tags: ['irt', '3pl', 'guessing', 'item response', 'psychometric']
	},
	{
		key: 'formulas.irt.IRT_INFO',
		title: 'IRT_INFO(theta, a, b, c?)',
		description:
			'Calculates the Fisher information for an IRT item at a given ability level. Higher information means the item provides more precise measurement at that ability level.\n\n' +
			'**Parameters:**\n' +
			'- `theta` (number) -- Person ability parameter\n' +
			'- `a` (number) -- Item discrimination parameter\n' +
			'- `b` (number) -- Item difficulty parameter\n' +
			'- `c` (number, optional) -- Guessing parameter (default: 0)\n\n' +
			'**Returns:** number (information value)\n\n' +
			'**Example:** `IRT_INFO(0, 1.5, 0)` returns the information at theta = 0',
		category: 'formulas',
		tags: ['irt', 'information', 'fisher', 'precision', 'psychometric']
	},
	{
		key: 'formulas.irt.IRT_THETA_MLE',
		title: 'IRT_THETA_MLE(responses, items)',
		description:
			'Estimates the person ability parameter (theta) using Maximum Likelihood Estimation via Newton-Raphson iteration. Bounded to [-5, 5].\n\n' +
			'**Parameters:**\n' +
			'- `responses` (array) -- Array of 0/1 response outcomes\n' +
			'- `items` (array) -- Array of item parameter objects `{a, b, c?}` matching each response\n\n' +
			'**Returns:** number (estimated theta)\n\n' +
			'**Example:** `IRT_THETA_MLE([1,0,1,1], [{a:1,b:-1},{a:1,b:0},{a:1,b:1},{a:1,b:2}])`',
		category: 'formulas',
		tags: ['irt', 'theta', 'mle', 'ability', 'estimation', 'psychometric']
	}
];
