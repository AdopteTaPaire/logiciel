// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process unless
// nodeIntegration is set to true in webPreferences.
// Use preload.js to selectively enable features
// needed in the renderer process.

const messagesTypes: { [key: string]: { logo: string } } = {
	error: { logo: "fa-exclamation-circle" },
};

window.addEventListener("DOMContentLoaded", () => {
	const openChrome = document.getElementById("open-chrome");
	if (openChrome) openChrome.addEventListener("click", window.api.chrome.open);

	const refresh = document.getElementById("refresh");
	if (refresh) refresh.addEventListener("click", window.api.window.refresh);

	const messageCard = {
		card: document.getElementById("message"),
		title: document.getElementById("message-title"),
		logo: document.getElementById("message-logo"),
		body: document.getElementById("message-body"),
	};

	const setMessage = (title?: string, type?: string, body?: string) => {
		if (!title) {
			messageCard.card.classList.add("hidden");
			messageCard.card.classList.remove("visible");
			return;
		}
		messageCard.card.classList.remove("hidden");
		messageCard.card.classList.add("visible");

		for (const curType in messagesTypes) {
			messageCard.card.classList.remove(curType);
			messageCard.logo.classList.remove(messagesTypes[curType].logo);
		}

		messageCard.card.classList.add(type);
		messageCard.title.innerText = title;
		messageCard.logo.classList.add(messagesTypes[type].logo);
		messageCard.body.innerText = body;
	};

	window.api.window.onError((message) => setMessage("Error", "error", message));
});
