import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('CSV merge page', () => {
	it('renders the standalone four-step workflow instead of the visual editor', async () => {
		render(Page);

		for (const name of ['1. Choose template', '2. Upload CSV', '3. Map values', '4. Generate']) {
			await expect.element(page.getByRole('heading', { name })).toBeInTheDocument();
		}
		await expect.element(page.getByText('🏷️ ZPL Editor', { exact: true })).not.toBeInTheDocument();
	});
});
