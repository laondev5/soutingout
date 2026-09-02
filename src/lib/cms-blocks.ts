/**
 * The widget vocabulary the CMS editor offers and the public pages render.
 *
 * Client-safe on purpose: the editor palette, the property panels and the
 * renderer all read from this one definition, so adding a widget means adding
 * one entry here plus one case in the renderer.
 */

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "notice",
  "image",
  "button",
  "factGrid",
  "pricingTable",
  "video",
  "faq",
  "divider",
  "spacer",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/** Which property editors a widget shows, in order. */
export type PropKind =
  | "text"
  | "textarea"
  | "richtext"
  | "select"
  | "boolean"
  | "number"
  | "image"
  | "stringList"
  | "pairList"
  | "url"

export type PropSpec = {
  key: string
  label: string
  kind: PropKind
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
  min?: number
  max?: number
}

export type BlockSpec = {
  type: BlockType
  name: string
  description: string
  /** Lucide icon name, resolved in the editor so specs stay serialisable. */
  icon: string
  defaults: Record<string, unknown>
  props: PropSpec[]
}

const ALIGN: PropSpec = {
  key: "align",
  label: "Alignment",
  kind: "select",
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
    { value: "right", label: "Right" },
  ],
}

export const BLOCK_SPECS: Record<BlockType, BlockSpec> = {
  heading: {
    type: "heading",
    name: "Heading",
    description: "A section title.",
    icon: "Heading",
    defaults: { text: "New heading", level: "h2", align: "left" },
    props: [
      { key: "text", label: "Text", kind: "text" },
      {
        key: "level",
        label: "Size",
        kind: "select",
        options: [
          { value: "h1", label: "Extra large (H1)" },
          { value: "h2", label: "Large (H2)" },
          { value: "h3", label: "Medium (H3)" },
          { value: "h4", label: "Small (H4)" },
        ],
      },
      ALIGN,
    ],
  },

  paragraph: {
    type: "paragraph",
    name: "Text",
    description: "A paragraph of copy.",
    icon: "Type",
    defaults: {
      text: "Write something here.",
      align: "left",
      size: "base",
      muted: false,
    },
    props: [
      {
        key: "text",
        label: "Text",
        kind: "richtext",
        help: "**bold**, *italic* and [links](https://example.com) are supported.",
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "sm", label: "Small" },
          { value: "base", label: "Normal" },
          { value: "lg", label: "Large" },
        ],
      },
      ALIGN,
      { key: "muted", label: "Muted colour", kind: "boolean" },
    ],
  },

  list: {
    type: "list",
    name: "List",
    description: "A bulleted or numbered list.",
    icon: "List",
    defaults: { items: ["First point", "Second point"], ordered: false },
    props: [
      { key: "items", label: "Items", kind: "stringList" },
      { key: "ordered", label: "Numbered", kind: "boolean" },
    ],
  },

  notice: {
    type: "notice",
    name: "Notice",
    description: "A highlighted callout box.",
    icon: "Info",
    defaults: { text: "Something worth noticing.", tone: "info" },
    props: [
      { key: "text", label: "Text", kind: "richtext" },
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        options: [
          { value: "info", label: "Info (green)" },
          { value: "warning", label: "Warning (amber)" },
          { value: "danger", label: "Danger (red)" },
          { value: "neutral", label: "Neutral (grey)" },
        ],
      },
    ],
  },

  image: {
    type: "image",
    name: "Image",
    description: "A picture, uploaded to Cloudinary.",
    icon: "Image",
    defaults: { url: "", alt: "", rounded: true, caption: "" },
    props: [
      { key: "url", label: "Image", kind: "image" },
      { key: "alt", label: "Alt text", kind: "text", help: "Describes the image for screen readers." },
      { key: "caption", label: "Caption", kind: "text" },
      { key: "rounded", label: "Rounded corners", kind: "boolean" },
    ],
  },

  button: {
    type: "button",
    name: "Button",
    description: "A link styled as a button.",
    icon: "MousePointerClick",
    defaults: { label: "Click here", href: "/register", variant: "default", align: "left" },
    props: [
      { key: "label", label: "Label", kind: "text" },
      { key: "href", label: "Links to", kind: "url", placeholder: "/register" },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: [
          { value: "default", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Plain" },
        ],
      },
      ALIGN,
    ],
  },

  factGrid: {
    type: "factGrid",
    name: "Fact cards",
    description: "A row of label-and-value cards.",
    icon: "LayoutGrid",
    defaults: {
      items: [
        { label: "Date", value: "Friday 2nd – Sunday 4th October 2026" },
        { label: "Venue", value: "Alheri Prayer Village, Kaduna" },
      ],
      columns: 3,
    },
    props: [
      { key: "items", label: "Cards", kind: "pairList" },
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 4 },
    ],
  },

  pricingTable: {
    type: "pricingTable",
    name: "Accommodation prices",
    description: "Live prices, pulled from the accommodation records.",
    icon: "BedDouble",
    defaults: { showSoldOut: true, showDescription: true },
    props: [
      { key: "showDescription", label: "Show descriptions", kind: "boolean" },
      { key: "showSoldOut", label: "Show sold-out tiers", kind: "boolean" },
    ],
  },

  video: {
    type: "video",
    name: "Video",
    description: "An embedded YouTube or Vimeo video.",
    icon: "Video",
    defaults: { url: "", title: "Video" },
    props: [
      { key: "url", label: "Video URL", kind: "url", placeholder: "https://youtube.com/watch?v=…" },
      { key: "title", label: "Title", kind: "text" },
    ],
  },

  faq: {
    type: "faq",
    name: "FAQ",
    description: "Expandable question-and-answer pairs.",
    icon: "MessageCircleQuestion",
    defaults: {
      items: [{ label: "A question?", value: "The answer." }],
    },
    props: [{ key: "items", label: "Questions", kind: "pairList" }],
  },

  divider: {
    type: "divider",
    name: "Divider",
    description: "A horizontal rule.",
    icon: "Minus",
    defaults: {},
    props: [],
  },

  spacer: {
    type: "spacer",
    name: "Spacer",
    description: "Vertical breathing room.",
    icon: "MoveVertical",
    defaults: { height: 24 },
    props: [{ key: "height", label: "Height (px)", kind: "number", min: 4, max: 200 }],
  },
}

export type Block = {
  id: string
  type: BlockType
  props: Record<string, unknown>
  visible: boolean
}

/** Sections of the delegate-facing site that the CMS owns. */
export const CMS_SECTIONS = [
  {
    slug: "home.hero",
    name: "Landing — hero",
    description: "The dark banner at the top of the home page.",
    onDark: true,
  },
  {
    slug: "home.body",
    name: "Landing — before you register",
    description: "The notes below the hero on the home page.",
  },
  {
    slug: "register.welcome",
    name: "Registration — step 1, Welcome",
    description: "The first screen of the registration stepper.",
  },
  {
    slug: "register.fees",
    name: "Registration — step 2, Fees",
    description: "Prices and what the fee covers.",
  },
  {
    slug: "register.feeding",
    name: "Registration — Feeding notice",
    description: "Shown above the comments box.",
  },
  {
    slug: "register.payment",
    name: "Registration — Payment notes",
    description: "Shown above the bank details on the last step.",
  },
  {
    slug: "register.submitted",
    name: "Registration — Thank you",
    description: "Shown after a delegate submits.",
  },
  {
    slug: "status.intro",
    name: "Status page — intro",
    description: "Above the lookup form on /status.",
  },
] as const

export type CmsSectionSlug = (typeof CMS_SECTIONS)[number]["slug"]

export const CMS_SECTION_SLUGS: readonly string[] = CMS_SECTIONS.map((section) => section.slug)

/** Narrows an untrusted string (a query param) to a known section. */
export function isSectionSlug(value: string): value is CmsSectionSlug {
  return CMS_SECTION_SLUGS.includes(value)
}

export function sectionMeta(slug: string) {
  return CMS_SECTIONS.find((section) => section.slug === slug) ?? null
}

/** A fresh block of the given type, with a client-generated id. */
export function newBlock(type: BlockType): Block {
  return {
    id: `b${Math.random().toString(36).slice(2, 10)}`,
    type,
    props: structuredClone(BLOCK_SPECS[type].defaults),
    visible: true,
  }
}
