import { hashJson } from "../../../lib/hash.ts";
import { computeContentWidth } from "../../../theme/tokens.ts";
import { parseDocxThemeExtension } from "../theme-extension.ts";
import { compileNumbering, headingsAreNumbered, numberingReferences } from "./numbering.ts";
import { compileSection } from "./section.ts";
import { buildStyleIds, compileStyles } from "./styles.ts";
import type { Theme } from "../../../types/theme.ts";
import type { DocxCompiledTheme, DocxParagraphBehaviour } from "../../../types/docx-theme.ts";

const paragraphBehaviourOf = (theme: Theme): DocxParagraphBehaviour => ({
  widowControl: theme.paragraph.widowControl,
  headingPageBreakBefore: [
    theme.heading[0].pageBreakBefore,
    theme.heading[1].pageBreakBefore,
    theme.heading[2].pageBreakBefore,
    theme.heading[3].pageBreakBefore,
    theme.heading[4].pageBreakBefore,
    theme.heading[5].pageBreakBefore,
  ],
});

export const compileThemeForDocx = (theme: Theme): DocxCompiledTheme => {
  const extension = parseDocxThemeExtension(theme.formats["docx"] ?? {});
  const styleIds = buildStyleIds(extension.styleIdPrefix);
  return {
    themeId: theme.id,
    themeHash: hashJson(theme),
    styles: compileStyles(theme, styleIds),
    numbering: compileNumbering(theme),
    section: compileSection(theme),
    contentWidth: computeContentWidth(theme),
    styleIds,
    numberingReferences,
    headingsAreNumbered: headingsAreNumbered(theme),
    paragraphBehaviour: paragraphBehaviourOf(theme),
    extension,
  };
};
