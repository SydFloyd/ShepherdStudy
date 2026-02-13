"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BIBLE_TRANSLATIONS } from "@/lib/bible";

type Props = {
  currentValue: string;
};

export function PassageVersionSelect({ currentValue }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("translation", value);
    router.push(`${pathname}?${next.toString()}` as never);
  }

  return (
    <label>
      Version
      <select
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
      >
        {BIBLE_TRANSLATIONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
