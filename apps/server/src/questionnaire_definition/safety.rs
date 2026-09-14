//! Executable-content checks shared by Definition inspection and commits.
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
                // Registry members are stable IDs, not configuration field names.
                // Their values still pass through the same executable checks.
                if matches!(
                    path,
                    "/questions" | "/variables" | "/assets" | "/extensions"
                ) {
                    inspect(child, &child_path, diagnostics);
                    continue;
                }
                let normalized: String = key
                    .chars()
                    .filter(char::is_ascii_alphanumeric)
                    .flat_map(char::to_lowercase)
                    .collect();
                // A form deadline action is a closed declarative enum, not an
                // authored callback. Only this exact field has that meaning.
                let deadline_action = key == "onTimeout"
                    && matches!(
                        path.split('/').collect::<Vec<_>>().as_slice(),
                        ["", "questions", _, "timing"] | ["", "content", "questions", _, "timing"]
                    )
                    && matches!(
                        child.as_str(),
                        Some("auto-submit" | "skip" | "terminate" | "warn")
                    );
                let executable_field = matches!(
                    normalized.as_str(),
                    "script"
                        | "scripts"
                        | "javascript"
                        | "javascripts"
                        | "hook"
                        | "hooks"
                        | "customfunction"
                        | "customfunctions"
                        | "globalscript"
                        | "globalscripts"
                        | "onenter"
                        | "onexit"
                        | "onresponse"
                        | "onvalidate"
                        | "onstart"
                        | "onfinish"
                        | "oninit"
                        | "onmount"
                        | "onnavigate"
                        | "onpageenter"
                        | "onpageexit"
                        | "ontimer"
                        | "onload"
                        | "onerror"
                        | "onclick"
                        | "onsubmit"
                        | "onchange"
                        | "oninput"
                        | "onkeydown"
                        | "onkeyup"
                        | "onkeypress"
                        | "onfocus"
                        | "onblur"
                        | "onbeforeunload"
                        | "onunload"
                        | "ontimeout"
                ) && value_is_non_empty(child)
                    && !deadline_action;
                let javascript_language = matches!(
                    normalized.as_str(),
                    "language" | "dialect" | "type" | "kind"
                ) && child.as_str().is_some_and(|s| {
                    let language = s.split(';').next().unwrap_or(s).trim().to_ascii_lowercase();
                    matches!(
                        language.as_str(),
                        "javascript"
                            | "ecmascript"
                            | "js"
                            | "text/javascript"
                            | "application/javascript"
                            | "text/ecmascript"
                            | "application/ecmascript"
                    )
                });
                // These nodes have JavaScript execution semantics and no Safe
                // Logic equivalent. Shared expression names (e.g. a safe member
                // lookup) are validated by the typed Safe Logic model instead.
                let javascript_node = matches!(normalized.as_str(), "type" | "kind")
                    && child.as_str().is_some_and(|kind| {
                        matches!(
                            kind,
                            "ImportExpression"
                                | "ImportDeclaration"
                                | "NewExpression"
                                | "FunctionExpression"
                                | "FunctionDeclaration"
                                | "ArrowFunctionExpression"
                                | "ClassExpression"
                                | "ClassDeclaration"
                                | "ThisExpression"
                        )
                    });
                let executable_url =
                    matches!(normalized.as_str(), "url" | "href" | "src" | "action")
                        && child.as_str().is_some_and(active_url);
                if executable_field || javascript_language || javascript_node || executable_url {
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
        Value::String(text) if signed_url(text) => diagnostics.push(error(
            "QDEF_INSTALLATION_STATE",
            path,
            "Signed URLs contain installation credentials and cannot be transferred in QDef.",
            Some("Use a portable asset reference or a public URL without signed credentials."),
        )),
        Value::String(text) if text.contains('<') && !passive_html(text) => {
            reject(path, diagnostics)
        }
        _ => {}
    }
}

fn signed_url(text: &str) -> bool {
    // Also covers URLs embedded in participant markup. Query names are
    // case-insensitive here because cloud providers use several spellings.
    let lower = text.to_ascii_lowercase();
    (lower.contains("https://") || lower.contains("http://"))
        && [
            "x-amz-signature=",
            "x-goog-signature=",
            "awsaccesskeyid=",
            "?signature=",
            "&signature=",
            "&amp;signature=",
            "?sig=",
            "&sig=",
            "&amp;sig=",
        ]
        .iter()
        .any(|key| lower.contains(key))
}

fn reject(path: &str, diagnostics: &mut Vec<DefinitionDiagnostic>) {
    diagnostics.push(error(
        "UNSAFE_EXECUTABLE", path,
        "Questionnaire Definitions cannot contain authored JavaScript or active HTML.",
        Some("Remove executable fields and active markup. Express required behavior in Safe Logic (qexpr/1 or qrule/1); unsupported Safe Logic capabilities must be resolved before import."),
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
