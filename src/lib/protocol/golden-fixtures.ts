export const GOLDEN_CARDS = {
	v0: {
		board: 'fg.metadata.board\nboard-id\n{"title":"Board","description":"Description"}',
		thread: 'fg.metadata.thread\nthread-id\nparent:board-id\n{"title":"Thread"}',
		post: 'fg.post\npost-id\nparent:thread-id\n{"content":"Post"}',
	},
	v1: {
		board: 'fg.metadata.board\nboard-id\n{"version":1,"title":"Board","description":"Description"}',
		thread: 'fg.metadata.thread\nthread-id\nparent:board-id\n{"version":1,"title":"Thread"}',
		post: 'fg.post\npost-id\nparent:thread-id\n{"version":1,"content":"Post"}',
	},
	unsupported: {
		board: 'fg.metadata.board\nboard-id\n{"version":2,"title":"Board","description":"Description"}',
		thread: 'fg.metadata.thread\nthread-id\nparent:board-id\n{"version":2,"title":"Thread"}',
		post: 'fg.post\npost-id\nparent:thread-id\n{"version":2,"content":"Post"}',
	},
} as const;
