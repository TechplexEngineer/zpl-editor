import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('ZPL Editor Page', () => {
	it('links to the isolated CSV merge example without rendering its upload controls', async () => {
		render(Page);

		const mergeLink = page.getByRole('link', { name: 'CSV Merge Example' });
		await expect.element(mergeLink).toHaveAttribute('href', '/merge');
		await expect.element(page.getByLabelText('Upload CSV')).not.toBeInTheDocument();
		await expect.element(page.getByLabelText('Barcode Value:')).toBeInTheDocument();
	});

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

	it('deletes the selected canvas item when Delete key is pressed', async () => {
		render(Page);

		// Wait for the ZPL Editor to be in the DOM
		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		// The default barcode element is selected on mount, so the "Delete" button should be visible in properties panel
		const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
		await expect.element(deleteButton).toBeInTheDocument();

		// Press the Delete key
		await userEvent.keyboard('{Delete}');

		// Verify the "Delete" button is no longer in the document (since no item is active anymore)
		await expect.element(deleteButton).not.toBeInTheDocument();
	});

	it('does not delete the selected canvas item when Delete key is pressed inside an input field', async () => {
		render(Page);

		// Wait for the ZPL Editor to be in the DOM
		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		// Find the delete button (which proves an item is selected)
		const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
		await expect.element(deleteButton).toBeInTheDocument();

		// Find and focus the width input using DOM query selector
		const widthInput = document.querySelector('input[type="number"]') as HTMLInputElement;
		expect(widthInput).not.toBeNull();
		widthInput.focus();

		// Press Delete key
		await userEvent.keyboard('{Delete}');

		// Verify the "Delete" button is still in the document (item was NOT deleted)
		await expect.element(deleteButton).toBeInTheDocument();
	});
});
