import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

async function load(entry) {
	const compiled = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		platform: 'node',
		format: 'cjs',
		plugins: [
			{
				name: 'obsidian',
				setup(b) {
					b.onResolve({ filter: /^obsidian$/ }, () => ({
						path: 'obsidian',
						namespace: 'stub',
					}));
					b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
						contents: `
export class App {}
export class Modal {}
export class Notice {}
export class TFile {
  constructor(path, extension, size = 1000, mtime = 1700000000000) {
    this.path = path;
    this.name = path.split('/').pop();
    this.extension = extension;
    this.stat = { size, mtime };
  }
}
export class TFolder {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
  }
  isRoot() { return !this.path || this.path === '/'; }
}
export const setIcon = () => {};
export const getLanguage = () => 'en';
export const requireApiVersion = () => true;
`,
					}));
				},
			},
		],
	});
	const mod = { exports: {} };
	new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(
		mod,
		mod.exports,
		require,
	);
	return mod.exports;
}

const {
	findUnlinkedMedia,
	formatBytes,
	IMAGE_EXTENSIONS,
	AUDIO_EXTENSIONS,
	VIDEO_EXTENSIONS,
} = await load('src/unlinked-media-modal.ts');

test('formatBytes formats file sizes correctly', () => {
	assert.equal(formatBytes(0), '0 B');
	assert.equal(formatBytes(500), '500 B');
	assert.equal(formatBytes(1024), '1 KB');
	assert.equal(formatBytes(1536), '1.5 KB');
	assert.equal(formatBytes(1048576), '1 MB');
	assert.equal(formatBytes(1073741824), '1 GB');
});

test('media extensions cover common images, audio, and video formats', () => {
	assert.ok(IMAGE_EXTENSIONS.has('png'));
	assert.ok(IMAGE_EXTENSIONS.has('jpg'));
	assert.ok(IMAGE_EXTENSIONS.has('svg'));
	assert.ok(IMAGE_EXTENSIONS.has('webp'));

	assert.ok(AUDIO_EXTENSIONS.has('mp3'));
	assert.ok(AUDIO_EXTENSIONS.has('wav'));
	assert.ok(AUDIO_EXTENSIONS.has('m4a'));

	assert.ok(VIDEO_EXTENSIONS.has('mp4'));
	assert.ok(VIDEO_EXTENSIONS.has('mov'));
	assert.ok(VIDEO_EXTENSIONS.has('webm'));
});

test('findUnlinkedMedia discovers unlinked images, audio, and video, excluding referenced or ignored files', () => {
	const files = [
		{ path: 'notes/intro.md', extension: 'md', stat: { size: 100, mtime: 1 } },
		{ path: 'assets/linked-image.png', extension: 'png', stat: { size: 2000, mtime: 10 } },
		{ path: 'assets/unused-image.jpg', extension: 'jpg', stat: { size: 5000, mtime: 20 } },
		{ path: 'assets/audio.mp3', extension: 'mp3', stat: { size: 15000, mtime: 30 } },
		{ path: 'assets/video.mp4', extension: 'mp4', stat: { size: 50000, mtime: 40 } },
		{ path: 'node_modules/ignored-icon.png', extension: 'png', stat: { size: 500, mtime: 5 } },
	];

	const resolvedLinks = {
		'notes/intro.md': {
			'assets/linked-image.png': 1,
		},
	};

	const app = {
		vault: {
			getFiles: () => files,
		},
		metadataCache: {
			resolvedLinks,
		},
	};

	const isPathIgnored = (path) => path.startsWith('node_modules/');

	// Vault-wide scope
	const results = findUnlinkedMedia(app, isPathIgnored, null);
	assert.equal(results.length, 3);

	const paths = results.map((r) => r.file.path);
	assert.ok(paths.includes('assets/unused-image.jpg'));
	assert.ok(paths.includes('assets/audio.mp3'));
	assert.ok(paths.includes('assets/video.mp4'));
	assert.ok(!paths.includes('assets/linked-image.png'), 'Linked image should not be included');
	assert.ok(!paths.includes('node_modules/ignored-icon.png'), 'Ignored file should not be included');

	const types = new Map(results.map((r) => [r.file.path, r.type]));
	assert.equal(types.get('assets/unused-image.jpg'), 'image');
	assert.equal(types.get('assets/audio.mp3'), 'audio');
	assert.equal(types.get('assets/video.mp4'), 'video');
});

test('findUnlinkedMedia restricts to folder scope and its descendants when folder is provided', () => {
	const files = [
		{ path: 'Projects/Design/logo-unused.png', extension: 'png', stat: { size: 1000, mtime: 1 } },
		{ path: 'Projects/voice.m4a', extension: 'm4a', stat: { size: 2000, mtime: 2 } },
		{ path: 'Other/random.png', extension: 'png', stat: { size: 3000, mtime: 3 } },
	];

	const app = {
		vault: {
			getFiles: () => files,
		},
		metadataCache: {
			resolvedLinks: {},
		},
	};

	const folder = { path: 'Projects', isRoot: () => false };
	const results = findUnlinkedMedia(app, () => false, folder);

	assert.equal(results.length, 2);
	const paths = results.map((r) => r.file.path);
	assert.deepEqual(paths.sort(), ['Projects/Design/logo-unused.png', 'Projects/voice.m4a'].sort());
	assert.ok(!paths.includes('Other/random.png'));
});
