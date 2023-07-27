//! Generates source code from the AST.
//! The inverse of parsing (which generates an AST from the source code)
use wasm_bindgen::prelude::*;

use crate::abstract_syntax_tree::{
    ArrayExpression, BinaryExpression, BinaryPart, BodyItem, CallExpression, FunctionExpression,
    Literal, MemberExpression, MemberObject, MemberProperty, ObjectExpression, PipeExpression,
    Program, UnaryExpression, Value,
};

fn recast_literal(literal: Literal) -> String {
    if let serde_json::Value::String(value) = literal.value {
        let quote = if literal.raw.trim().starts_with('"') {
            '"'
        } else {
            '\''
        };
        format!("{}{}{}", quote, value, quote)
    } else {
        literal.value.to_string()
    }
}

fn precedence(operator: &str) -> u8 {
    match operator {
        "+" | "-" => 11,
        "*" | "/" | "%" => 12,
        _ => 0,
    }
}

fn recast_binary_expression(expression: BinaryExpression) -> String {
    let maybe_wrap_it = |a: String, doit: bool| -> String {
        if doit {
            format!("({})", a)
        } else {
            a
        }
    };

    let should_wrap_right = match expression.right.clone() {
        BinaryPart::BinaryExpression(bin_exp) => {
            precedence(&expression.operator) > precedence(&bin_exp.operator)
                || expression.operator == "-"
        }
        _ => false,
    };

    let should_wrap_left = match expression.left.clone() {
        BinaryPart::BinaryExpression(bin_exp) => {
            precedence(&expression.operator) > precedence(&bin_exp.operator)
        }
        _ => false,
    };

    format!(
        "{} {} {}",
        maybe_wrap_it(recast_binary_part(expression.left), should_wrap_left),
        expression.operator,
        maybe_wrap_it(recast_binary_part(expression.right), should_wrap_right)
    )
}

fn recast_binary_part(part: BinaryPart) -> String {
    match part {
        BinaryPart::Literal(literal) => recast_literal(*literal),
        BinaryPart::Identifier(identifier) => identifier.name,
        BinaryPart::BinaryExpression(binary_expression) => {
            recast_binary_expression(*binary_expression)
        }
        BinaryPart::CallExpression(call_expression) => {
            recast_call_expression(*call_expression, "".to_string(), false)
        }
        _ => "".to_string(),
    }
}

fn recast_value(node: Value, _indentation: String, is_in_pipe_expression: bool) -> String {
    let indentation = _indentation + if is_in_pipe_expression { "  " } else { "" };
    match node {
        Value::BinaryExpression(bin_exp) => recast_binary_expression(*bin_exp),
        Value::ArrayExpression(array_exp) => recast_array_expression(*array_exp, indentation),
        Value::ObjectExpression(obj_exp) => {
            recast_object_expression(*obj_exp, indentation, is_in_pipe_expression)
        }
        Value::MemberExpression(mem_exp) => recast_member_expression(*mem_exp),
        Value::Literal(literal) => recast_literal(*literal),
        Value::FunctionExpression(func_exp) => recast_function(*func_exp),
        Value::CallExpression(call_exp) => {
            recast_call_expression(*call_exp, indentation, is_in_pipe_expression)
        }
        Value::Identifier(ident) => ident.name,
        Value::PipeExpression(pipe_exp) => recast_pipe_expression(*pipe_exp),
        Value::UnaryExpression(unary_exp) => recast_unary_expression(*unary_exp),
        _ => "".to_string(),
    }
}

fn recast_array_expression(expression: ArrayExpression, indentation: String) -> String {
    let flat_recast = format!(
        "[{}]",
        expression
            .elements
            .iter()
            .map(|el| recast_value(el.clone(), "".to_string(), false))
            .collect::<Vec<String>>()
            .join(", ")
    );
    let max_array_length = 40;
    if flat_recast.len() > max_array_length {
        let _indentation = indentation.clone() + "  ";
        format!(
            "[\n{}{}\n{}]",
            _indentation,
            expression
                .elements
                .iter()
                .map(|el| recast_value(el.clone(), _indentation.clone(), false))
                .collect::<Vec<String>>()
                .join(format!(",\n{}", _indentation).as_str()),
            indentation
        )
    } else {
        flat_recast
    }
}

fn recast_object_expression(
    expression: ObjectExpression,
    indentation: String,
    is_in_pipe_expression: bool,
) -> String {
    let flat_recast = format!(
        "{{ {} }}",
        expression
            .properties
            .iter()
            .map(|prop| {
                format!(
                    "{}: {}",
                    prop.key.name,
                    recast_value(prop.value.clone(), "".to_string(), false)
                )
            })
            .collect::<Vec<String>>()
            .join(", ")
    );
    let max_array_length = 40;
    if flat_recast.len() > max_array_length {
        let _indentation = indentation + "  ";
        format!(
            "{{\n{}{}\n{}}}",
            _indentation,
            expression
                .properties
                .iter()
                .map(|prop| {
                    format!(
                        "{}: {}",
                        prop.key.name,
                        recast_value(
                            prop.value.clone(),
                            _indentation.clone(),
                            is_in_pipe_expression
                        )
                    )
                })
                .collect::<Vec<String>>()
                .join(format!(",\n{}", _indentation).as_str()),
            if is_in_pipe_expression { "    " } else { "" }
        )
    } else {
        flat_recast
    }
}

fn recast_call_expression(
    expression: CallExpression,
    indentation: String,
    is_in_pipe_expression: bool,
) -> String {
    format!(
        "{}({})",
        expression.callee.name,
        expression
            .arguments
            .iter()
            .map(|arg| recast_argument(arg.clone(), indentation.clone(), is_in_pipe_expression))
            .collect::<Vec<String>>()
            .join(", ")
    )
}

fn recast_argument(argument: Value, indentation: String, is_in_pipe_expression: bool) -> String {
    match argument {
        Value::Literal(literal) => recast_literal(*literal),
        Value::Identifier(identifier) => identifier.name,
        Value::BinaryExpression(binary_exp) => recast_binary_expression(*binary_exp),
        Value::ArrayExpression(array_exp) => recast_array_expression(*array_exp, indentation),
        Value::ObjectExpression(object_exp) => {
            recast_object_expression(*object_exp, indentation, is_in_pipe_expression)
        }
        Value::CallExpression(call_exp) => {
            recast_call_expression(*call_exp, indentation, is_in_pipe_expression)
        }
        Value::FunctionExpression(function_exp) => recast_function(*function_exp),
        Value::PipeSubstitution(_) => "%".to_string(),
        Value::UnaryExpression(unary_exp) => recast_unary_expression(*unary_exp),
        _ => "".to_string(),
    }
}

fn recast_member_expression(expression: MemberExpression) -> String {
    let key_str = match expression.property {
        MemberProperty::Identifier(identifier) => {
            if expression.computed {
                format!("[{}]", &(*identifier.name))
            } else {
                format!(".{}", &(*identifier.name))
            }
        }
        MemberProperty::Literal(lit) => format!("[{}]", &(*lit.raw)),
    };

    match expression.object {
        MemberObject::MemberExpression(member_exp) => {
            recast_member_expression(*member_exp) + key_str.as_str()
        }
        MemberObject::Identifier(identifier) => identifier.name + key_str.as_str(),
    }
}

fn recast_pipe_expression(expression: PipeExpression) -> String {
    expression
        .body
        .iter()
        .enumerate()
        .map(|(index, statement)| {
            let mut indentation = "  ".to_string();
            let mut maybe_line_break = "\n".to_string();
            let mut str = recast_value(statement.clone(), indentation.clone(), true);
            let non_code_meta = expression.non_code_meta.clone();
            if let Some(non_code_meta_value) = non_code_meta.none_code_nodes.get(&index)
            {
                if non_code_meta_value.value != " " {
                    str += non_code_meta_value.value.as_str();
                    indentation = "".to_string();
                    maybe_line_break = "".to_string();
                }
            }

            if index != expression.body.len() - 1 {
                str += maybe_line_break.as_str();
                str += indentation.as_str();
                str += "|> ".to_string().as_str();
            }
            str
        })
        .collect::<Vec<String>>()
        .join("")
}

fn recast_unary_expression(expression: UnaryExpression) -> String {
    let bin_part_val = match expression.argument {
        BinaryPart::Literal(literal) => Value::Literal(literal),
        BinaryPart::Identifier(identifier) => Value::Identifier(identifier),
        BinaryPart::BinaryExpression(binary_expression) => {
            Value::BinaryExpression(binary_expression)
        }
        BinaryPart::CallExpression(call_expression) => Value::CallExpression(call_expression),
        BinaryPart::UnaryExpression(unary_expression) => Value::UnaryExpression(unary_expression),
    };
    format!(
        "{}{}",
        expression.operator,
        recast_value(bin_part_val, "".to_string(), false)
    )
}

pub fn recast(ast: Program, indentation: String, is_with_block: bool) -> String {
    ast.body
        .iter()
        .map(|statement| match statement.clone() {
            BodyItem::ExpressionStatement(expression_statement) => {
                match expression_statement.expression {
                    Value::BinaryExpression(binary_expression) => {
                        recast_binary_expression(*binary_expression)
                    }
                    Value::ArrayExpression(array_expression) => {
                        recast_array_expression(*array_expression, "".to_string())
                    }
                    Value::ObjectExpression(object_expression) => {
                        recast_object_expression(*object_expression, "".to_string(), false)
                    }
                    Value::CallExpression(call_expression) => {
                        recast_call_expression(*call_expression, "".to_string(), false)
                    }
                    _ => "Expression".to_string(),
                }
            }
            BodyItem::VariableDeclaration(variable_declaration) => variable_declaration
                .declarations
                .iter()
                .map(|declaration| {
                    format!(
                        "{} {} = {}",
                        variable_declaration.kind,
                        declaration.id.name,
                        recast_value(declaration.init.clone(), "".to_string(), false)
                    )
                })
                .collect::<Vec<String>>()
                .join(""),
            BodyItem::ReturnStatement(return_statement) => {
                format!(
                    "return {}",
                    recast_argument(return_statement.argument, "".to_string(), false)
                )
            }
        })
        .enumerate()
        .map(|(index, recast_str)| {
            let is_legit_custom_whitespace_or_comment =
                |str: String| str != " " && str != "\n" && str != "  ";

            // determine the value of startString
            let last_white_space_or_comment = if index > 0 {
                let tmp = if let Some(non_code_node) = ast
                    .non_code_meta
                    .none_code_nodes
                    .get(&(index - 1))
                {
                    non_code_node.value.clone()
                } else {
                    " ".to_string()
                };
                tmp
            } else {
                " ".to_string()
            };
            // indentation of this line will be covered by the previous if we're using a custom whitespace or comment
            let mut start_string =
                if is_legit_custom_whitespace_or_comment(last_white_space_or_comment) {
                    "".to_string()
                } else {
                    indentation.clone()
                };
            if index == 0 {
                if let Some(start) = ast.non_code_meta.start.clone() {
                    start_string = start.value;
                } else {
                    start_string = indentation.clone();
                }
            }
            if start_string.ends_with('\n') {
                start_string += indentation.as_str();
            }

            // determine the value of endString
            let maybe_line_break: String = if index == ast.body.len() - 1 && !is_with_block {
                "".to_string()
            } else {
                "\n".to_string()
            };
            let mut custom_white_space_or_comment =
                match ast.non_code_meta.none_code_nodes.get(&index) {
                    Some(custom_white_space_or_comment) => {
                        custom_white_space_or_comment.value.clone()
                    }
                    None => "".to_string(),
                };
            if !is_legit_custom_whitespace_or_comment(custom_white_space_or_comment.clone()) {
                custom_white_space_or_comment = "".to_string();
            }
            let end_string = if !custom_white_space_or_comment.is_empty() {
                custom_white_space_or_comment
            } else {
                maybe_line_break
            };

            format!("{}{}{}", start_string, recast_str, end_string)
        })
        .collect::<Vec<String>>()
        .join("")
}

pub fn recast_function(expression: FunctionExpression) -> String {
    format!(
        "({}) => {{{}}}",
        expression
            .params
            .iter()
            .map(|param| param.name.clone())
            .collect::<Vec<String>>()
            .join(", "),
        recast(
            Program {
                start: expression.body.start,
                end: expression.body.start,
                body: expression.body.body,
                non_code_meta: expression.body.non_code_meta
            },
            "".to_string(),
            true
        )
    )
}

#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// wasm_bindgen wrapper for recast
// test for this function and by extension the recaster are done in javascript land src/lang/recast.test.ts
#[wasm_bindgen]
pub fn recast_js(json_str: &str) -> String {
    // deserialize the ast from a stringified json
    let result: Result<Program, _> = serde_json::from_str(json_str);
    let ast = match result {
        Ok(ast) => ast,
        Err(e) => {
            log(e.to_string().as_str());
            panic!("error: {}", e)
        }
    };

    recast(ast, "".to_string(), false)
}