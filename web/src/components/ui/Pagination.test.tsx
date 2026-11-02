// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Lang } from '../../i18n';
import { renderInLang } from '../../test/render';
import { Pagination } from './Pagination';

function renderPage(page: number, total: number, lang: Lang = 'fr') {
  const onChange = vi.fn();
  renderInLang(<Pagination page={page} pageSize={20} total={total} onChange={onChange} />, lang);
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
  return { onChange, button };
}

describe('Pagination', () => {
  it('shows which rows are on screen and the page count', () => {
    renderPage(2, 45);
    expect(screen.getByText('21–40 sur 45')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it.each([
    ['en', '21–40 of 45'],
    ['ar', '21–40 من 45'],
  ] as const)('speaks the UI language (%s)', (lang, range) => {
    renderPage(2, 45, lang);
    expect(screen.getByText(range)).toBeTruthy();
  });

  it('cannot go back from the first page', () => {
    const { onChange, button } = renderPage(1, 45);
    expect(button('Page précédente').disabled).toBe(true);
    fireEvent.click(button('Page suivante'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('shows the partial last page and stops there', () => {
    const { onChange, button } = renderPage(3, 45);
    expect(screen.getByText('41–45 sur 45')).toBeTruthy();
    expect(button('Page suivante').disabled).toBe(true);
    fireEvent.click(button('Page précédente'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('handles an empty list', () => {
    const { button } = renderPage(1, 0);
    expect(screen.getByText('0–0 sur 0')).toBeTruthy();
    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(button('Page précédente').disabled).toBe(true);
    expect(button('Page suivante').disabled).toBe(true);
  });

  it('groups large totals with the locale separator', () => {
    renderPage(1, 12345, 'en');
    expect(screen.getByText('1–20 of 12,345')).toBeTruthy();
    expect(screen.getByText('1 / 618')).toBeTruthy();
  });
});
