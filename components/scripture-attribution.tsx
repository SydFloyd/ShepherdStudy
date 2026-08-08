import type { BibleSourceInfo } from "@/lib/bible";

type Props = {
  source?: BibleSourceInfo | null;
  className?: string;
};

export function ScriptureAttribution({ source, className }: Props) {
  if (!source) {
    return null;
  }

  return (
    <p
      className={`scriptureAttribution${className ? ` ${className}` : ""}`}
      dir="ltr"
      data-provider={source.provider}
    >
      {source.provider === "esv" ? (
        <span>
          Scripture quotation marked{" "}
          <a href="https://www.esv.org/" target="_blank" rel="noreferrer">
            ESV
          </a>
          . See the full copyright and usage notice on the{" "}
          <a href="/info">Info page</a>.
        </span>
      ) : source.provider === "dbs" ? (
        <>
          <span>
            Scripture text generously provided by the{" "}
            <a href="https://dbs.org/" target="_blank" rel="noreferrer">
              Digital Bible Society
            </a>
            .
          </span>
          <span className="scriptureEdition">
            Edition: {" "}
            <bdi dir="auto" lang={source.languageIso}>
              {source.title}
            </bdi>
            {source.year ? ` (${source.year})` : ""}.
          </span>
        </>
      ) : (
        <span>
          Scripture text: {" "}
          <bdi dir="auto" lang={source.languageIso}>
            {source.title}
          </bdi>
          {source.year ? ` (${source.year})` : ""}
          .
        </span>
      )}
      {source.copyright && source.provider !== "esv" ? (
        <span className="scriptureCopyright">
          <bdi dir="auto" lang={source.languageIso}>
            {source.copyright}
          </bdi>
        </span>
      ) : null}
    </p>
  );
}
