import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageMarkdown from './MessageMarkdown';

const renderMarkdown = (text: string) => render(<MessageMarkdown text={text} />);

describe('MessageMarkdown', () =>
{
    it('opens links in a new tab without passing the opener', () =>
    {
        renderMarkdown('see [the docs](https://example.com/docs)');

        expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute('href', 'https://example.com/docs');
        expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute('target', '_blank');
        expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('turns a javascript: link into plain text', () =>
    {
        renderMarkdown('[click me](javascript:alert(1))');

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText('click me')).toBeInTheDocument();
    });

    it('shows an image as a link instead of loading it', () =>
    {
        const { container } = renderMarkdown('![a cat](https://example.com/cat.png)');

        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByRole('link', { name: 'a cat' })).toHaveAttribute('href', 'https://example.com/cat.png');
    });

    it('does not render raw HTML', () =>
    {
        const { container } = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');

        expect(container.querySelector('img, script')).toBeNull();
    });

    it('shows headings as paragraphs so a message cannot add page headings', () =>
    {
        renderMarkdown('# Big news');

        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.getByText('Big news').tagName).toBe('P');
    });

    it('shows tables as the text that was typed', () =>
    {
        const table = '| a | b |\n| - | - |\n| 1 | 2 |';
        const { container } = renderMarkdown(table);

        expect(container.querySelector('table')).toBeNull();
        expect(container).toHaveTextContent('| a | b |');
    });

    it('hides a spoiler until it is clicked', async () =>
    {
        const user = userEvent.setup();
        renderMarkdown('the ending: ||he dies||');

        const spoiler = screen.getByRole('button', { name: 'Spoiler, press to reveal' });
        expect(spoiler).toHaveTextContent('he dies');

        await user.click(spoiler);

        expect(screen.queryByRole('button', { name: 'Spoiler, press to reveal' })).not.toBeInTheDocument();
        expect(screen.getByText('he dies')).toBeVisible();
    });

    it.each(['{Enter}', ' '])('reveals a spoiler from the keyboard with %s', async (key) =>
    {
        const user = userEvent.setup();
        renderMarkdown('||secret||');

        await user.tab();
        await user.keyboard(key);

        expect(screen.queryByRole('button', { name: 'Spoiler, press to reveal' })).not.toBeInTheDocument();
    });

    it('keeps a spoiler around formatting as typed', () =>
    {
        renderMarkdown('||**bold**||');

        expect(screen.queryByRole('button', { name: 'Spoiler, press to reveal' })).not.toBeInTheDocument();
    });
});
