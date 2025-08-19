import { Api } from 'telegram';
import { useForumsStore } from '@state/forums';

export function makeInputPeerChannel(channelId: number, accessHash: string | bigint | undefined): Api.TypeInputPeer {
	if (accessHash === undefined || accessHash === null) throw new Error('Missing accessHash');
	return new Api.InputPeerChannel({ channelId, accessHash } as any);
}

export function getInputPeerForForumId(forumId: number): Api.TypeInputPeer {
	const meta = useForumsStore.getState().getForum(forumId);
	if (!meta) throw new Error('Forum not found in store');
	if (meta.accessHash !== undefined && meta.accessHash !== null) {
		return makeInputPeerChannel(meta.id, meta.accessHash);
	}
	return new Api.InputPeerChat({ chatId: meta.id } as any);
}