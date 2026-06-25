import { describe, expect, test } from "bun:test";
import { bareValueText } from "../src/tools/buildProgrammingBasicsContent";

describe("bareValueText（问题2：符号专项裸值去外层引号）", () => {
  test("去掉 string 值的外层双引号", () => {
    expect(bareValueText('"192.168.1.1"', "string")).toBe("192.168.1.1");
    expect(bareValueText('"https://api.example.com/v1"', "string")).toBe(
      "https://api.example.com/v1",
    );
  });

  test("去掉 string 值的外层单引号（PHP/Ruby 风格）", () => {
    expect(bareValueText("'192.168.1.1'", "string")).toBe("192.168.1.1");
    expect(bareValueText("'application/json'", "string")).toBe("application/json");
  });

  test("去掉 raw-string 前缀与引号，保留正则内容", () => {
    expect(bareValueText('r"^\\d{4}-\\d{2}$"', "string")).toBe("^\\d{4}-\\d{2}$");
  });

  test("裸正则字面量保持原样", () => {
    expect(bareValueText("/^[a-z]+$/", "string")).toBe("/^[a-z]+$/");
  });

  test("literal 字符字面量保留引号（去了就只剩一个字母，无意义）", () => {
    expect(bareValueText("'A'", "literal")).toBe("'A'");
    expect(bareValueText("'\\n'", "literal")).toBe("'\\n'");
  });

  test("literal 数字保持原样", () => {
    expect(bareValueText("3000", "literal")).toBe("3000");
    expect(bareValueText("0xFF", "literal")).toBe("0xFF");
  });

  test("不误伤只是以引号开头的表达式", () => {
    expect(bareValueText('"a"+"b"', "string")).toBe('"a"+"b"');
  });
});
