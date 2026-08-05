"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";

import {
  BibleVersion,
  getTranslationLabel,
  LOCAL_BIBLE_VERSIONS
} from "@/lib/bible";
import {
  mergeBibleVersions,
  searchBibleVersions,
  TRANSLATION_SEARCH_LIMIT
} from "@/lib/bible-version-search";

type CatalogResponse = {
  translations: BibleVersion[];
  remoteAvailable: boolean;
  warning?: string;
};

type Props = {
  value: string;
  onChange: (value: string, version?: BibleVersion) => void;
  label: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  ariaDescribedBy?: string;
  className?: string;
};

let catalogPromise: Promise<CatalogResponse> | null = null;

function isBibleVersion(value: unknown): value is BibleVersion {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<BibleVersion>;
  return (
    typeof candidate.value === "string" &&
    typeof candidate.providerId === "string" &&
    (candidate.provider === "local" || candidate.provider === "dbs") &&
    typeof candidate.label === "string" &&
    typeof candidate.title === "string" &&
    (candidate.vernacularTitle === null ||
      typeof candidate.vernacularTitle === "string") &&
    typeof candidate.languageName === "string" &&
    typeof candidate.languageIso === "string" &&
    typeof candidate.script === "string" &&
    (candidate.direction === "ltr" || candidate.direction === "rtl") &&
    (candidate.year === null || typeof candidate.year === "number") &&
    (candidate.copyright === null || typeof candidate.copyright === "string") &&
    typeof candidate.originalLanguage === "boolean"
  );
}

async function loadCatalog(): Promise<CatalogResponse> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/bible/translations", {
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Bible translation catalog request failed.");
        }
        const payload = (await response.json()) as Partial<CatalogResponse>;
        const translations = Array.isArray(payload.translations)
          ? payload.translations.filter(isBibleVersion)
          : [];
        if (translations.length === 0) {
          throw new Error("Bible translation catalog was empty.");
        }
        return {
          translations,
          remoteAvailable: payload.remoteAvailable === true,
          warning:
            typeof payload.warning === "string" ? payload.warning : undefined
        };
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

function getVersionMeta(version: BibleVersion): string {
  return [
    version.languageName,
    version.languageIso.toUpperCase(),
    version.script,
    version.provider === "dbs" ? "Digital Bible Society" : "Local"
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

function getVersionDisplayName(version: BibleVersion): string {
  return version.label || version.vernacularTitle || version.title;
}

function getPickerOptions(
  translations: readonly BibleVersion[],
  query: string,
  selectedVersion: BibleVersion | null
): BibleVersion[] {
  const matches = searchBibleVersions(translations, query);
  if (
    query.trim() ||
    !selectedVersion ||
    matches.some((version) => version.value === selectedVersion.value)
  ) {
    return matches;
  }

  const firstRemoteIndex = matches.findIndex(
    (version) => version.provider === "dbs"
  );
  const insertionIndex =
    firstRemoteIndex === -1 ? matches.length : firstRemoteIndex;
  return [
    ...matches.slice(0, insertionIndex),
    selectedVersion,
    ...matches.slice(insertionIndex)
  ].slice(0, TRANSLATION_SEARCH_LIMIT);
}

export function TranslationPicker({
  value,
  onChange,
  label,
  id,
  name,
  disabled = false,
  required = false,
  ariaDescribedBy,
  className
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const inputId = id ?? `translation-picker-${reactId}`;
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const resultsId = `${inputId}-results`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLLIElement>());
  const [translations, setTranslations] = useState<BibleVersion[]>(() => [
    ...LOCAL_BIBLE_VERSIONS
  ]);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ready" | "local-only"
  >("loading");
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    void loadCatalog()
      .then((catalog) => {
        if (!mounted) {
          return;
        }
        setTranslations(
          mergeBibleVersions(LOCAL_BIBLE_VERSIONS, catalog.translations)
        );
        setCatalogState(catalog.remoteAvailable ? "ready" : "local-only");
        setCatalogWarning(catalog.warning ?? null);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setCatalogState("local-only");
        setCatalogWarning(
          "The multilingual catalog is temporarily unavailable. Local translations remain available."
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedVersion = useMemo(
    () => translations.find((version) => version.value === value) ?? null,
    [translations, value]
  );
  const selectedLabel = selectedVersion
    ? getVersionDisplayName(selectedVersion)
    : getTranslationLabel(value);
  const options = useMemo(
    () => getPickerOptions(translations, query, selectedVersion),
    [query, selectedVersion, translations]
  );
  const safeActiveIndex = options.length
    ? Math.min(activeIndex, options.length - 1)
    : -1;
  const activeOption =
    safeActiveIndex >= 0 ? options[safeActiveIndex] ?? null : null;

  useEffect(() => {
    if (!open || !activeOption) {
      return;
    }
    optionRefs.current.get(activeOption.value)?.scrollIntoView({
      block: "nearest"
    });
  }, [activeOption, open]);

  function selectVersion(version: BibleVersion) {
    onChange(version.value, version);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOpen(true);
    setActiveIndex(0);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        options.length ? Math.min(current + 1, options.length - 1) : 0
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeOption) {
        selectVersion(activeOption);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setQuery("");
      setOpen(false);
    }
  }

  const statusText =
    catalogState === "loading"
      ? "Loading multilingual translations\u2026"
      : catalogState === "local-only"
        ? catalogWarning ??
          "The multilingual catalog is temporarily unavailable. Local translations remain available."
        : `${translations.length.toLocaleString()} translations available.`;

  return (
    <div
      className={`translationPicker${className ? ` ${className}` : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery("");
          setOpen(false);
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="translationPickerInputWrap">
        <div className="translationPickerControl">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              open && activeOption
                ? `${inputId}-option-${safeActiveIndex}`
                : undefined
            }
            aria-describedby={
              [ariaDescribedBy, statusId, open ? resultsId : null]
                .filter(Boolean)
                .join(" ")
            }
            autoComplete="off"
            spellCheck={false}
            required={required}
            disabled={disabled}
            dir="auto"
            lang={!open ? selectedVersion?.languageIso : undefined}
            value={open ? query : selectedLabel}
            placeholder={open ? `Search from ${selectedLabel}` : undefined}
            onFocus={() => {
              setQuery("");
              setOpen(true);
              const browseOptions = getPickerOptions(
                translations,
                "",
                selectedVersion
              );
              setActiveIndex(
                Math.max(
                  browseOptions.findIndex((version) => version.value === value),
                  0
                )
              );
            }}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="translationPickerToggle"
            aria-label={
              open ? "Close translation list" : "Open translation list"
            }
            aria-expanded={open}
            aria-controls={listboxId}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setOpen((current) => !current);
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">{"\u25be"}</span>
          </button>
        </div>

        {open ? (
          <div className="translationPickerPopover">
            <ul id={listboxId} role="listbox" aria-label={label}>
              {options.map((version, index) => {
                const vernacularTitle =
                  version.vernacularTitle &&
                  version.vernacularTitle !== version.title &&
                  version.vernacularTitle !== version.label
                    ? version.vernacularTitle
                    : null;
                return (
                  <li
                    key={version.value}
                    ref={(node) => {
                      if (node) {
                        optionRefs.current.set(version.value, node);
                      } else {
                        optionRefs.current.delete(version.value);
                      }
                    }}
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={version.value === value}
                    className={
                      index === safeActiveIndex ? "isActive" : undefined
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectVersion(version)}
                  >
                    <span
                      className="translationPickerOptionTitle"
                      dir="auto"
                      lang={version.languageIso}
                    >
                      {getVersionDisplayName(version)}
                    </span>
                    {vernacularTitle ? (
                      <span
                        className="translationPickerVernacular"
                        dir="auto"
                        lang={version.languageIso}
                      >
                        {vernacularTitle}
                      </span>
                    ) : null}
                    <span className="translationPickerOptionMeta">
                      {getVersionMeta(version)}
                    </span>
                    {version.value === value ? (
                      <span
                        className="translationPickerSelected"
                        aria-hidden="true"
                      >
                        {"\u2713"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {options.length === 0 ? (
              <p className="translationPickerEmpty">
                No translations match &quot;{query}&quot;.
              </p>
            ) : null}
            <p
              id={resultsId}
              className="translationPickerHint"
              aria-live="polite"
            >
              {options.length === TRANSLATION_SEARCH_LIMIT
                ? "Showing the first 50 matches. Keep typing to narrow the list."
                : `${options.length} matching translation${options.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        ) : null}
      </div>

      <span
        id={statusId}
        className={`translationPickerStatus${
          catalogState === "local-only" ? " isWarning" : " isQuiet"
        }`}
        aria-live="polite"
      >
        {statusText}
      </span>
    </div>
  );
}
