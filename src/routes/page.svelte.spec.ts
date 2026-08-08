import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('ZPL Editor Page Persistence', () => {
	it('keeps the same canvas element instance when switching tabs', async () => {
		render(Page);

		// Wait for the ZPL Editor to be in the DOM
		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		// Get the underlying canvas DOM element reference
		const canvasElBefore = document.querySelector('canvas');
		expect(canvasElBefore).not.toBeNull();

		// Switch to "ZPL Code" tab
		const zplTabButton = page.getByRole('button', { name: 'ZPL Code' });
		await zplTabButton.click();

		// Verify ZPL view is displayed
		await expect.element(page.getByText('Real-Time Generated ZPL Code')).toBeInTheDocument();

		// Switch back to "Editor" tab
		const editorTabButton = page.getByRole('button', { name: 'Editor' });
		await editorTabButton.click();

		// Wait/assert ZPL Editor is visible/in the document again
		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		// Get the canvas DOM element reference after switching back
		const canvasElAfter = document.querySelector('canvas');
		
		// Assert that it is the exact same DOM element instance (persistence)
		expect(canvasElAfter).toBe(canvasElBefore);
	});
});
