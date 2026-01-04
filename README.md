<h1 align="center">
✂️ Text Splitter
</h1>
<p align="center">
    English | <a href="./README-zh.md">中文</a>
</p>
<p align="center">
    <em>Powerful long text processing tool for AI model optimization, document editing, and content management</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tools.newzone.top/en/text-splitter"><img src="https://img.shields.io/badge/Live%20Demo-text--splitter-blue" alt="Live Demo"></a>
</p>

**Text Splitter** is a powerful long text processing tool designed for scenarios like ChatGPT, DeepSeek and other AI model optimization, document editing, and social media content management. It supports **three splitting modes**: character count split, custom delimiter split, and Chinese paragraph split, along with advanced features such as escape character support, batch export, and ZIP packaging for efficient and convenient text processing.

👉 **Try it online**: <https://tools.newzone.top/en/text-splitter>

## Key Features

- **Three Splitting Modes**: Character count, custom delimiter, and intelligent Chinese paragraph splitting
- **Smart Recognition**: Supports single-character and multi-character delimiters with automatic semantic preservation
- **Escape Character Support**: `\n` (newline), `\r` (carriage return), `\t` (tab), `\s` (space), `\\` (backslash)
- **Batch Export**: Export all segments at once, automatically packaged as ZIP
- **Quick Copy**: One-click copy of any segment for immediate use
- **Performance Optimization**: Virtualized rendering for smooth handling of large texts

## Three Splitting Modes

### 1. Character Count Split Mode

Set the maximum number of characters per text segment in the "Split Character Count" input box (default: 2000 characters). The system will split the text based on the specified length, suitable for scenarios that require control over text size.

**Special Feature**: If the input is left empty or set to 0, and custom delimiter splitting is enabled, the system will only split by delimiter with no character limit.

### 2. Custom Delimiter Split Mode

- **Mixed Splitting**: Combines character count limits with delimiter-based splitting, searching for appropriate delimiters near the split point to preserve semantic integrity
- **Pure Delimiter Splitting**: If character count is left empty, the system will split only by delimiter with no character limit
- **Smart Recognition**: Supports single-character delimiters (e.g., `。`) and multi-character delimiters (e.g., `\n\n`)
- **Delimiter Retention**: Each split segment retains the delimiter at the end of the paragraph

**Quick Settings**:

- Chinese Sentence Endings: `。 ？ ！`
- English Sentence Endings: `. ? !`

**Escape Character Support**: `\n` (newline), `\r` (carriage return), `\t` (tab), `\s` (space), `\\` (backslash)

### 3. Chinese Paragraph Split Mode

Click the "Split by Chinese Paragraph" button to use an intelligent paragraph recognition algorithm to split Chinese text naturally by line breaks. Designed for Chinese articles, blog content, and other texts where paragraph integrity is important.

## Advanced Feature Settings

### Performance Optimization Options

- **Virtualized Rendering**: Enabled by default; recommended to keep on for smooth scrolling with large texts
- **Disable** if needed (not recommended for large texts)

### Export File Name

Customize the base name for exported files (default: `text_chunk_`). Exported files will be automatically numbered, e.g., `text_chunk_1.txt`, `text_chunk_2.txt`, etc.

## Export and Copy Functions

### Smart Batch Export

Click the **"Export All"** button to:

- Export all text segments at once
- Automatically package as ZIP file
- Preserve original file encoding

### Quick Copy Function

Each text segment has a **"Copy"** button for instant clipboard access.

## Use Cases & Recommendations

### AI Model Input Optimization

**Scenario**: Large documents need to be split to fit AI model input limits (e.g., ChatGPT, DeepSeek)

**Recommended Settings**:

- **Character Count**: Set based on model limits (e.g., 2000 characters)
- **Delimiter**: Use sentence endings (`。` for Chinese, `.` for English) to preserve semantic completeness
- **Mode**: Mixed splitting for optimal semantic integrity

### Social Media Content

**Scenario**: Long articles split for multi-post sharing (e.g., Twitter threads, WeChat moments)

**Recommended Settings**:

- **Character Count**: Set to platform limits (e.g., 280 for Twitter, 2000 for WeChat)
- **Delimiter**: Use paragraph breaks (`\n\n` or `。`) for natural flow
- **Export**: Use batch export for all segments

### Document Editing

**Scenario**: Chapters, sections, or paragraph reorganization

**Recommended Settings**:

- **Chinese Text**: Use "Chinese Paragraph Split" mode for natural paragraph boundaries
- **Other Text**: Use custom delimiter split with `\n\n` for paragraph breaks
- **Export**: Batch export to ZIP for organized file management

## Documentation & Deployment

For detailed usage instructions and deployment guides, see the **[Official Documentation](https://docs.newzone.top/en/guide/tools/text-splitter.html)**.

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

MIT © 2025 [rockbenben](https://github.com/rockbenben). See [LICENSE](./LICENSE).
