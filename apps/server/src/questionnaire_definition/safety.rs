//! Fail-closed executable-content checks for the text-only Definition tracer.
//! These validate input without sanitizing or rewriting researcher content.
use std::cell::Cell;

use html5ever::tokenizer::{BufferQueue, Token, TokenSink, TokenSinkResult, Tokenizer};
use serde_json::Value;

use super::{error, pointer_segment, value_is_non_empty, DefinitionDiagnostic};

pub(super) fn inspect(value: &Value, path: &str, diagnostics: &mut Vec<DefinitionDiagnostic>) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}/{}", pointer_segment(key));
                let normalized: String = key
                    .chars()
                    .filter(char::is_ascii_alphanumeric)
                    .flat_map(char::to_lowercase)
                    .collect();
                let executable_field = matches!(
                    normalized.as_str(),
                    "script"
                        | "scripts"
                        | "hooks"
                        | "customfunctions"
                        | "globalscripts"
                        | "onenter"
                        | "onexit"
                        | "onresponse"
                        | "onvalidate"
                        | "onstart"
                        | "onfinish"
                        | "oninit"
                        | "onload"
                        | "onerror"
                ) && value_is_non_empty(child);
                let javascript_language = normalized == "language"
                    && child.as_str().is_some_and(|s| {
                        matches!(
                            s.to_ascii_lowercase().as_str(),
                            "javascript" | "ecmascript" | "js"
                        )
                    });
                let executable_url =
                    matches!(normalized.as_str(), "url" | "href" | "src" | "action")
                        && child.as_str().is_some_and(active_url);
                if executable_field || javascript_language || executable_url {
                    reject(&child_path, diagnostics);
                } else {
                    inspect(child, &child_path, diagnostics);
                }
            }
        }
        Value::Array(array) => {
            for (index, child) in array.iter().enumerate() {
                inspect(child, &format!("{path}/{index}"), diagnostics);
            }
        }
        Value::String(text) if text.contains('<') && !passive_html(text) => {
            reject(path, diagnostics)
        }
        _ => {}
    }
}

fn reject(path: &str, diagnostics: &mut Vec<DefinitionDiagnostic>) {
    diagnostics.push(error(
        "UNSAFE_EXECUTABLE", path,
        "Executable fields or active HTML are not supported by the text-only QDef tracer.",
        Some("Remove JavaScript/active markup. Use passive text markup; Safe Logic requires its separately delivered QDef capability."),
    ));
}

fn active_url(value: &str) -> bool {
    // The HTML tokenizer has already decoded character references. Browsers
    // ignore ASCII control/space characters when resolving dangerous schemes.
    let normalized: String = value
        .chars()
        .filter(|c| !c.is_ascii_control() && !c.is_ascii_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    normalized.starts_with("javascript:")
        || normalized.starts_with("vbscript:")
        || normalized.starts_with("data:")
}

#[derive(Default)]
struct PassiveHtml {
    rejected: Cell<bool>,
}

impl TokenSink for PassiveHtml {
    type Handle = ();

    fn process_token(&self, token: Token, _line_number: u64) -> TokenSinkResult<()> {
        if let Token::TagToken(tag) = token {
            // Only passive text markup is part of this tracer. Foreign content,
            // script/style, documents, embeds and interactive controls need a
            // separate capability; do not guess their execution semantics.
            let passive_tag = matches!(
                tag.name.as_ref(),
                "a" | "abbr"
                    | "b"
                    | "bdi"
                    | "bdo"
                    | "blockquote"
                    | "br"
                    | "caption"
                    | "cite"
                    | "code"
                    | "col"
                    | "colgroup"
                    | "dd"
                    | "del"
                    | "details"
                    | "dfn"
                    | "div"
                    | "dl"
                    | "dt"
                    | "em"
                    | "figcaption"
                    | "figure"
                    | "h1"
                    | "h2"
                    | "h3"
                    | "h4"
                    | "h5"
                    | "h6"
                    | "hr"
                    | "i"
                    | "img"
                    | "ins"
                    | "kbd"
                    | "li"
                    | "mark"
                    | "ol"
                    | "p"
                    | "pre"
                    | "q"
                    | "rp"
                    | "rt"
                    | "ruby"
                    | "s"
                    | "samp"
                    | "small"
                    | "span"
                    | "strong"
                    | "sub"
                    | "summary"
                    | "sup"
                    | "table"
                    | "tbody"
                    | "td"
                    | "th"
                    | "thead"
                    | "tfoot"
                    | "time"
                    | "tr"
                    | "u"
                    | "ul"
                    | "var"
                    | "wbr"
            );
            let active_attribute = tag.attrs.iter().any(|attribute| {
                let name = attribute.name.local.as_ref();
                name.starts_with("on")
                    || matches!(name, "style" | "srcdoc")
                    || active_url(&attribute.value)
            });
            if !passive_tag || active_attribute {
                self.rejected.set(true);
            }
        }
        TokenSinkResult::Continue
    }
}

fn passive_html(source: &str) -> bool {
    // Parse HTML tokens instead of searching strings: entity-escaped URLs,
    // mixed-case names and malformed markup follow the browser tokenizer.
    let input = BufferQueue::default();
    input.push_back(source.into());
    let tokenizer = Tokenizer::new(PassiveHtml::default(), Default::default());
    let _ = tokenizer.feed(&input);
    tokenizer.end();
    !tokenizer.sink.rejected.get()
}
