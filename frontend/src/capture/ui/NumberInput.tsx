import { round } from "@dash/core";
import { type InputHTMLAttributes, useState } from "react";

const parse = (text: string) => {
  const n = Number(text.replace(",", ".").trim());
  return text.trim() === "" || Number.isNaN(n) ? undefined : n;
};

/** Stored values can carry float noise or a source's unrounded maths, e.g. 2.5e-05 g salt. */
const format = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? "" : String(round(value, 3)));

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode"> & {
  value?: number;
  onChange: (n?: number) => void;
  /** Whole numbers only, e.g. kcal; changes the phone keyboard. */
  integer?: boolean;
};

/**
 * Keeps what was typed, so "1," or "0.0" survive until the next digit; a number-controlled input
 * would round them away. Comma and dot both work, since phone keyboards follow the locale.
 */
export function NumberInput({ value, onChange, integer = false, ...rest }: Props) {
  const [text, setText] = useState(format(value));
  const shown = parse(text) === value || (value === undefined && parse(text) === undefined) ? text : format(value);

  return (
    <input
      {...rest}
      inputMode={integer ? "numeric" : "decimal"}
      value={shown}
      onChange={(e) => {
        const next = e.target.value;
        if (!/^[0-9]*[.,]?[0-9]*$/.test(next.trim())) return;
        setText(next);
        onChange(parse(next));
      }}
    />
  );
}
