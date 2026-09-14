use serde_json::Value;

/// Independent variants exercise fields that cannot all be active in one study.
pub fn cases() -> Vec<(String, Value)> {
    let base: Value = serde_json::from_str(include_str!("qdef-behavior.json")).unwrap();
    let variants: Value =
        serde_json::from_str(include_str!("qdef-behavior-variants.json")).unwrap();
    let mut result = vec![("complete behavioral model".to_owned(), base.clone())];
    for variant in variants.as_array().unwrap() {
        let mut document = base.clone();
        for (path, replacement) in variant["fields"].as_object().unwrap() {
            let (parent, key) = path.rsplit_once('/').unwrap();
            let target = document
                .pointer_mut(parent)
                .unwrap_or_else(|| panic!("Missing fixture parent {parent}"));
            match target {
                Value::Object(object) => {
                    object.insert(key.to_owned(), replacement.clone());
                }
                Value::Array(array) => array[key.parse::<usize>().unwrap()] = replacement.clone(),
                _ => panic!("Invalid fixture parent {parent}"),
            }
        }
        let name = variant["name"].as_str().unwrap();
        document["questionnaire"]["name"] = Value::String(format!("Behavior variant: {name}"));
        result.push((name.to_owned(), document));
    }
    result
}
