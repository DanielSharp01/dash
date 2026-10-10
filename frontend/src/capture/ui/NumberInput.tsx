import { type InputHTMLAttributes, useState } from "react";

const parse = (text: string) => {
  const n = Number(text.replace(",", ".").trim());
  return text.trim() === "" || Number.isNaN(n) ? undefined : n;
};

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
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? "" : String(value));
  const shown = parse(text) === value || (value === undefined && parse(text) === undefined) ? text : value === undefined || Number.isNaN(value) ? "" : String(value);

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
