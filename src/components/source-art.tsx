import type { Source } from "@/lib/domain";
export function SourceArt({
  visual = "village",
}: {
  visual?: Source["visual"];
}) {
  return (
    <svg
      viewBox="0 0 400 220"
      role="img"
      aria-label={`Illustration éditoriale : ${visual === "culture" ? "lieux culturels" : visual === "nature" ? "paysages" : visual === "gourmand" ? "marchés et saveurs" : "vie locale"}`}
      className={`source-art source-art-${visual}`}
    >
      <rect
        width="400"
        height="220"
        fill={
          visual === "gourmand"
            ? "#efdfc9"
            : visual === "culture"
              ? "#e5e1e9"
              : "#e1e8d9"
        }
      />
      <circle cx="320" cy="52" r="27" fill="#dc996c" />
      <path d="M0 168 85 63 170 160 249 46 400 190V220H0Z" fill="#b8c8b2" />
      <path d="m217 85 32-39 34 43-25-9-10 11-13-15Z" fill="#f7f5e9" />
      <path d="M0 196Q100 130 210 185T400 162V220H0Z" fill="#789181" />
      {visual === "village" && (
        <g>
          <path d="M80 135h150v76H80Z" fill="#f4edda" />
          <path d="m65 135 90-60 90 60Z" fill="#b66e50" />
          <path
            d="M140 170h30v41h-30Zm-40-18h19v22h-19Zm93 0h19v22h-19Z"
            fill="#355b49"
          />
          <circle cx="155" cy="125" r="10" fill="#e4b96f" />
        </g>
      )}
      {visual === "culture" && (
        <g>
          <path d="M77 110h230v100H77Z" fill="#f6e9d7" />
          <path d="m65 110 127-59 127 59Z" fill="#b47760" />
          <path
            d="M99 125h20v85H99Zm53 0h20v85h-20Zm53 0h20v85h-20Zm53 0h20v85h-20Z"
            fill="#b9a992"
          />
          <path d="M65 210h254" stroke="#355b49" strokeWidth="9" />
        </g>
      )}
      {visual === "gourmand" && (
        <g>
          <path d="M84 109h225v93H84Z" fill="#f7edda" />
          <path d="m70 109 25-43h202l25 43Z" fill="#ba704e" />
          <path
            d="M113 66h27l-8 43h-31Zm66 0h27v43h-27Zm65 0h27l19 43h-31Z"
            fill="#f6e8ca"
          />
          <path d="M77 167h240v35H77Z" fill="#355b49" />
          <circle cx="125" cy="153" r="14" fill="#e7ad57" />
          <circle cx="167" cy="153" r="14" fill="#b46b4d" />
          <path d="M222 168v-40h37v40Z" fill="#c3ce9d" />
        </g>
      )}
      {visual === "nature" && (
        <g fill="#355b49">
          <path d="m50 174 29-86 29 86H86v40H73v-40Zm65 12 21-62 23 62h-17v28h-10v-28Zm190-10 28-89 28 89h-22v38h-13v-38Z" />
          <path
            d="M221 220q-39-34-3-56t-4-40"
            fill="none"
            stroke="#ead6aa"
            strokeWidth="13"
          />
        </g>
      )}
    </svg>
  );
}
