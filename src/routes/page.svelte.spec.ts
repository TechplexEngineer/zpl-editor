import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('ZPL Editor Page', () => {
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

	it('undoes and redoes canvas deletion from the toolbar', async () => {
		render(Page);

		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
		const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
		const redoButton = page.getByRole('button', { name: 'Redo', exact: true });

		await deleteButton.click();
		await expect.element(deleteButton).not.toBeInTheDocument();

		await undoButton.click();
		await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toBeInTheDocument();

		await redoButton.click();
		await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).not.toBeInTheDocument();
	});

	it('undoes and redoes toolbar property changes', async () => {
		render(Page);

		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).toBeInTheDocument();

		const widthInput = page.getByRole('spinbutton', { name: /width \(in\)/i });
		const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
		const redoButton = page.getByRole('button', { name: 'Redo', exact: true });
		await expect.element(widthInput).toHaveValue(4);

		await widthInput.click();
		await userEvent.keyboard('{Control>}a{/Control}5');
		await page.getByText('🏷️ ZPL Editor', { exact: true }).click();

		await expect.element(widthInput).toHaveValue(5);

		await undoButton.click();

		await expect.element(widthInput).toHaveValue(4);

		await redoButton.click();

		await expect.element(widthInput).toHaveValue(5);
	});
});
