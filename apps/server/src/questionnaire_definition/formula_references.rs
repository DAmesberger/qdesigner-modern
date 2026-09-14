//! Collect symbolic reads for dependency analysis, without evaluating authored formulas.
//!
//! Only names resolved by the caller become graph edges. This is deliberately not
//! a replacement for the scripting language's parser or execution capability check.
//! Strings, comments, numeric exponents, static property keys and function callees
//! are not variable reads (matching VariableEngine's SymbolNode traversal).
fn identifier_start(c: char) -> bool {
    matches!(c, 'a'..='z' | 'A'..='Z' | '_' | '$' | '\u{00c0}'..='\u{02af}' | '\u{0370}'..='\u{03ff}' | '\u{2100}'..='\u{214f}' | '\u{1d400}'..='\u{1d7ff}')
}

pub(super) fn symbols(formula: &str) -> Vec<String> {
    let chars: Vec<char> = formula.chars().collect();
    let mut result = Vec::new();
    let mut index = 0;
    let mut previous = None;
    let mut nesting = 0usize;
    while index < chars.len() {
        let current = chars[index];
        if current.is_whitespace() {
            if current == '\n' && nesting == 0 {
                previous = None;
            }
            index += 1;
            continue;
        }
        if current == '#' {
            while index < chars.len() && chars[index] != '\n' {
                index += 1;
            }
            continue;
        }
        if current == '\'' || current == '"' {
            index += 1;
            while index < chars.len() {
                let next = chars[index];
                index += 1;
                if next == '\\' {
                    index = (index + 1).min(chars.len());
                } else if next == current {
                    break;
                }
            }
            previous = Some('"');
            continue;
        }
        if current.is_ascii_digit()
            || (current == '.' && chars.get(index + 1).is_some_and(char::is_ascii_digit))
        {
            if current == '0' && matches!(chars.get(index + 1), Some('x' | 'b' | 'o')) {
                index += 2;
                while chars.get(index).is_some_and(char::is_ascii_hexdigit) {
                    index += 1;
                }
                if chars.get(index) == Some(&'i')
                    && chars.get(index + 1).is_some_and(char::is_ascii_digit)
                {
                    index += 1;
                    while chars.get(index).is_some_and(char::is_ascii_digit) {
                        index += 1;
                    }
                }
                previous = Some('0');
                continue;
            }
            index += 1;
            while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.') {
                index += 1;
            }
            if matches!(chars.get(index), Some('e' | 'E')) {
                let mut exponent = index + 1;
                if matches!(chars.get(exponent), Some('+' | '-')) {
                    exponent += 1;
                }
                if chars.get(exponent).is_some_and(char::is_ascii_digit) {
                    index = exponent + 1;
                    while chars.get(index).is_some_and(char::is_ascii_digit) {
                        index += 1;
                    }
                }
            }
            previous = Some('0');
            continue;
        }
        if identifier_start(current) {
            let start = index;
            index += 1;
            while index < chars.len()
                && (identifier_start(chars[index]) || chars[index].is_ascii_digit())
            {
                index += 1;
            }
            let next_index = (index..chars.len())
                .find(|i| !chars[*i].is_whitespace() || (nesting == 0 && chars[*i] == '\n'));
            let next = next_index.map(|i| &chars[i]);
            // FunctionAssignmentNode visits the body, not its parameter declarations.
            if let Some(open) = next_index.filter(|i| chars[*i] == '(') {
                let mut depth = 1;
                let mut close = open + 1;
                while close < chars.len() && depth > 0 {
                    match chars[close] {
                        '(' => depth += 1,
                        ')' => depth -= 1,
                        _ => {}
                    }
                    close += 1;
                }
                let assignment = (close..chars.len()).find(|i| !chars[*i].is_whitespace());
                if depth == 0
                    && assignment.is_some_and(|i| chars[i] == '=' && chars.get(i + 1) != Some(&'='))
                {
                    index = assignment.unwrap() + 1;
                    previous = Some('=');
                    continue;
                }
            }
            let is_object_key = matches!(previous, Some('{' | ',')) && next == Some(&':');
            let symbol: String = chars[start..index].iter().collect();
            let follows_operand = matches!(previous, Some('a' | '0' | ')' | ']' | '}' | '"'));
            let is_keyword = matches!(
                symbol.as_str(),
                "true" | "false" | "null" | "undefined" | "NaN" | "Infinity" | "not"
            ) || (follows_operand
                && matches!(symbol.as_str(), "and" | "or" | "xor" | "mod" | "to"))
                || (follows_operand && previous != Some('0') && symbol == "in");
            if previous != Some('.') && next != Some(&'(') && !is_object_key && !is_keyword {
                result.push(symbol.clone());
            }
            previous = if is_keyword
                && !matches!(
                    symbol.as_str(),
                    "true" | "false" | "null" | "undefined" | "NaN" | "Infinity"
                ) {
                Some('+')
            } else {
                Some('a')
            };
            continue;
        }
        previous = Some(current);
        match current {
            '(' | '[' | '{' => nesting += 1,
            ')' | ']' | '}' => nesting = nesting.saturating_sub(1),
            _ => {}
        }
        index += 1;
    }
    result
}
