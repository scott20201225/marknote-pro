# Diagram Examples

这是一份用于 `MarkNotePro` 图表能力测试的示例文档。

## 1. Mermaid Flowchart

```mermaid
flowchart TD
    A[开始] --> B[打开 MarkNotePro]
    B --> C[新建或打开 Markdown]
    C --> D{是否包含 Mermaid?}
    D -->|是| E[渲染图表]
    D -->|否| F[按普通 Markdown 显示]
    E --> G[继续编辑并保存]
```

## 2. Mermaid Sequence Diagram

```mermaid
sequenceDiagram
    participant U as 用户
    participant M as MarkNotePro
    participant E as Editor

    U->>M: 打开 Diagram-Examples.md
    M->>E: 解析 Markdown
    E-->>M: 识别 Mermaid 代码块
    M-->>U: 渲染时序图
```

## 3. Mermaid Class Diagram

```mermaid
classDiagram
    class DocumentStore {
        +load()
        +save()
    }

    class EditorSession {
        +renderMarkdown()
        +toggleTheme()
    }

    DocumentStore --> EditorSession : provides content
```

## 4. Legacy Flowchart

下面这个不是 Mermaid，而是老的 `flowchart.js` 语法：

```flowchart
st=>start: Start
op=>operation: Edit Markdown
cond=>condition: Save file?
e=>end: End

st->op->cond
cond(yes)->e
cond(no)->op
```

## 5. Legacy Sequence

下面这个也不是 Mermaid，而是老的 `js-sequence-diagrams` 语法：

```sequence
用户->MarkNotePro: 打开文档
MarkNotePro->Editor: 加载内容
Editor-->MarkNotePro: 返回渲染结果
MarkNotePro-->用户: 展示图表
```

## 6. Mermaid Mindmap

```mermaid
mindmap
  root((MarkNotePro))
    Mermaid
      Flowchart
      Sequence Diagram
      Class Diagram
      Concept Map
    Legacy
      Flowchart
      Sequence
```
