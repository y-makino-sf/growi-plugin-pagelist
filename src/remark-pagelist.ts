import type { LeafGrowiPluginDirective, TextGrowiPluginDirective } from '@growi/remark-growi-directive';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

// GROWI独自ディレクティブの属性を文字列として渡し、閲覧画面とプレビューで同じ解析結果を使います。
export const remarkPageListPlugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, (node) => {
    if (String(node.type) !== 'textGrowiPluginDirective' && String(node.type) !== 'leafGrowiPluginDirective') return;
    const directive = node as TextGrowiPluginDirective | LeafGrowiPluginDirective;
    if (directive.name !== 'pagelist') return;
    const attributes = directive.attributes ?? {};
    const positional = Object.entries(attributes).find(([key, value]) =>
      key.startsWith('/') && (value === '' || value == null));
    const value = (key: string, fallback: string) => (attributes[key] ?? fallback).trim();
    directive.data = {
      ...directive.data,
      hName: 'growi-pagelist',
      hProperties: {
        targetpath: value('path', positional?.[0] ?? ''),
        limit: value('limit', attributes.num ?? '10'),
        recursive: value('recursive', 'true').toLowerCase() === 'false' ? 'false' : 'true',
        sort: value('sort', 'updatedAt'),
        tag: value('tag', ''),
        view: value('view', 'list').toLowerCase() === 'card' ? 'card' : 'list',
        newdays: value('newdays', '3'),
        // 値の検証は描画側に集約し、直接呼び出しとMarkdown経由で挙動を揃えます。
        excerpt: value('excerpt', 'true'),
        excerptlength: value('excerptlength', '200'),
        excerptlines: value('excerptlines', '3'),
      },
    };
  });
};