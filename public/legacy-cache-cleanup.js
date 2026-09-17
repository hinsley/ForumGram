// This name belonged to ForumGram's former broad runtime-image rule only.
self.addEventListener('activate', event => {
	event.waitUntil(caches.delete('images'));
});
