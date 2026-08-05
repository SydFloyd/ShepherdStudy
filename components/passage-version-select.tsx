"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TranslationPicker } from "@/components/translation-picker";

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
    <div className="passageVersionSelect">
      <TranslationPicker
        id="passage-translation"
        label="Bible version"
        value={currentValue}
        onChange={onChange}
      />
    </div>
  );
}
