import { File, Folder, FolderOpen } from "lucide-react";

const FILENAME_COLORS: Record<string, string> = {
  "package.json":      "#CB3837",
  "package-lock.json": "#CB3837",
  "yarn.lock":         "#CB3837",
  "pnpm-lock.yaml":    "#CB3837",
  "cargo.toml":        "#CE422B",
  "cargo.lock":        "#CE422B",
  "tsconfig.json":     "#3178C6",
  "jsconfig.json":     "#3178C6",
  "vite.config.ts":    "#646CFF",
  "vite.config.js":    "#646CFF",
  ".gitignore":        "#F54D27",
  ".gitattributes":    "#F54D27",
  ".gitmodules":       "#F54D27",
  ".env":              "#ECD53F",
  ".env.local":        "#ECD53F",
  ".env.example":      "#ECD53F",
  ".eslintrc":         "#4B32C3",
  ".eslintrc.json":    "#4B32C3",
  ".eslintrc.js":      "#4B32C3",
  ".eslintrc.ts":      "#4B32C3",
  ".prettierrc":       "#F7B93E",
  ".prettierrc.json":  "#F7B93E",
  "dockerfile":        "#2496ED",
  "docker-compose.yml":      "#2496ED",
  "docker-compose.yaml":     "#2496ED",
  "readme.md":         "#519ABA",
  "license":           "#9E9E9E",
  "licence":           "#9E9E9E",
  "claude.md":         "#FF7B72",
  "agents.md":         "#FF7B72",
  "makefile":          "#6D8086",
  "gradle":            "#02303A",
};

const EXT_COLORS: Record<string, string> = {
  ts:       "#3178C6",
  tsx:      "#3178C6",
  mts:      "#3178C6",
  cts:      "#3178C6",
  js:       "#CBCB41",
  jsx:      "#CBCB41",
  mjs:      "#CBCB41",
  cjs:      "#CBCB41",
  json:     "#CBCB41",
  jsonc:    "#CBCB41",
  css:      "#519ABA",
  scss:     "#CE6699",
  sass:     "#CE6699",
  less:     "#2A4F7C",
  styl:     "#2A4F7C",
  html:     "#E44D26",
  htm:      "#E44D26",
  xml:      "#E44D26",
  svg:      "#FF9800",
  py:       "#3572A5",
  pyw:      "#3572A5",
  rs:       "#CE422B",
  toml:     "#9C4221",
  yaml:     "#CB171E",
  yml:      "#CB171E",
  md:       "#519ABA",
  mdx:      "#519ABA",
  sh:       "#4EAA25",
  bash:     "#4EAA25",
  zsh:      "#4EAA25",
  fish:     "#4EAA25",
  ps1:      "#012456",
  go:       "#00ACD7",
  java:     "#CC3E44",
  kt:       "#A97BFF",
  kts:      "#A97BFF",
  swift:    "#FA7343",
  c:        "#A8B9CC",
  h:        "#A8B9CC",
  cpp:      "#659AD2",
  cc:       "#659AD2",
  cxx:      "#659AD2",
  hpp:      "#659AD2",
  cs:       "#239120",
  vue:      "#4FC08D",
  svelte:   "#FF3E00",
  php:      "#777BB3",
  rb:       "#CC342D",
  lua:      "#000080",
  r:        "#198CE7",
  dart:     "#00B4AB",
  ex:       "#6E4A7E",
  exs:      "#6E4A7E",
  elm:      "#60B5CC",
  clj:      "#5881D8",
  hs:       "#5E5086",
  sql:      "#DAA038",
  graphql:  "#E10098",
  gql:      "#E10098",
  prisma:   "#2D3748",
  proto:    "#3A8FD1",
  lock:     "#BBBBBB",
  env:      "#ECD53F",
  log:      "#9E9E9E",
  txt:      "#9E9E9E",
  csv:      "#89D185",
  png:      "#FF80AB",
  jpg:      "#FF80AB",
  jpeg:     "#FF80AB",
  gif:      "#FF80AB",
  webp:     "#FF80AB",
  ico:      "#FF80AB",
  bmp:      "#FF80AB",
  tiff:     "#FF80AB",
  mp4:      "#00BCD4",
  mov:      "#00BCD4",
  avi:      "#00BCD4",
  mp3:      "#00BCD4",
  wav:      "#00BCD4",
  ttf:      "#9C27B0",
  woff:     "#9C27B0",
  woff2:    "#9C27B0",
  otf:      "#9C27B0",
  zip:      "#AF7AC5",
  tar:      "#AF7AC5",
  gz:       "#AF7AC5",
  rar:      "#AF7AC5",
  pdf:      "#FF5733",
};

const DIR_COLORS: Record<string, string> = {
  src:           "#519ABA",
  source:        "#519ABA",
  lib:           "#519ABA",
  app:           "#519ABA",
  dist:          "#A97BFF",
  build:         "#A97BFF",
  out:           "#A97BFF",
  output:        "#A97BFF",
  public:        "#4EAA25",
  static:        "#4EAA25",
  assets:        "#4EAA25",
  images:        "#FF80AB",
  img:           "#FF80AB",
  icons:         "#FF80AB",
  fonts:         "#9C27B0",
  test:          "#4EAA25",
  tests:         "#4EAA25",
  spec:          "#4EAA25",
  __tests__:     "#4EAA25",
  __mocks__:     "#9E9E9E",
  docs:          "#519ABA",
  documentation: "#519ABA",
  config:        "#9E9E9E",
  configs:       "#9E9E9E",
  scripts:       "#4EAA25",
  node_modules:  "#CB3837",
  ".git":        "#F54D27",
  ".github":     "#A97BFF",
  ".vscode":     "#519ABA",
  ".claude":     "#FF7B72",
  ".agents":     "#FF7B72",
  crates:        "#CE422B",
  target:        "#9E9E9E",
  vendor:        "#9E9E9E",
  packages:      "#CBCB41",
  components:    "#4FC08D",
  hooks:         "#A97BFF",
  utils:         "#9E9E9E",
  helpers:       "#9E9E9E",
  types:         "#3178C6",
  styles:        "#CE6699",
  pages:         "#E44D26",
  views:         "#E44D26",
  routes:        "#CBCB41",
  store:         "#A97BFF",
  redux:         "#A97BFF",
  context:       "#A97BFF",
  api:           "#DAA038",
  services:      "#DAA038",
  models:        "#DAA038",
  migrations:    "#DAA038",
  middleware:    "#9E9E9E",
};

const DEFAULT_FILE_COLOR = "#9E9E9E";
const DEFAULT_DIR_COLOR  = "#EAB700";

function getFileColor(name: string): string {
  const lower = name.toLowerCase();
  if (FILENAME_COLORS[lower]) return FILENAME_COLORS[lower];
  const dot = lower.lastIndexOf(".");
  if (dot !== -1) {
    const ext = lower.slice(dot + 1);
    if (EXT_COLORS[ext]) return EXT_COLORS[ext];
  }
  return DEFAULT_FILE_COLOR;
}

function getDirColor(name: string): string {
  return DIR_COLORS[name.toLowerCase()] ?? DEFAULT_DIR_COLOR;
}

interface Props {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
  size?: number;
}

export default function FileIcon({ name, isDir, isOpen = false, size = 13 }: Props) {
  if (isDir) {
    const color = getDirColor(name);
    return isOpen
      ? <FolderOpen size={size} style={{ color, flexShrink: 0 }} />
      : <Folder    size={size} style={{ color, flexShrink: 0 }} />;
  }
  const color = getFileColor(name);
  return <File size={size} style={{ color, flexShrink: 0 }} />;
}
