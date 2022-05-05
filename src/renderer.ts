// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process unless
// nodeIntegration is set to true in webPreferences.
// Use preload.js to selectively enable features
// needed in the renderer process.

const messagesTypes: { [key: string]: { logo: string } } = {
	error: { logo: "fa-exclamation-circle" },
};

const params: { [key: string]: string } = {
	vinted_email: "",
	vinted_password: "",
	lbc_email: "",
	lbc_password: "",
	app_username: "",
	app_password: "",
	chrome_path: "",
};

window.addEventListener("DOMContentLoaded", () => {
	const menuButton = document.getElementById("menu");
	const navPanel = document.getElementsByClassName("nav-panel")[0];

	if (menuButton && navPanel)
		menuButton.addEventListener("click", () => {
			navPanel.classList.toggle("close");
		});

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

	const continueCard = {
		card: document.getElementById("continue"),
		title: document.getElementById("continue-title"),
		logo: document.getElementById("continue-logo"),
		body: document.getElementById("continue-body"),
		button: document.getElementById("continue-button"),
	};

	window.api.chrome.onNeedContinue((...args: unknown[]) => {
		continueCard.card.classList.remove("hidden");
		continueCard.card.classList.add("visible");

		continueCard.body.innerText = args[0] as string;

		continueCard.button.addEventListener("click", () => {
			continueCard.card.classList.add("hidden");
			continueCard.card.classList.remove("visible");
			window.api.chrome.continue();
		});
	});

	const parameters = document.getElementById("parameters");
	if (parameters) {
		parameters.innerHTML = "";
		for (const param in params) {
			window.api.params.get(param);

			const elem = document.createElement("div");
			elem.classList.add("input");

			const label = document.createElement("label");
			label.innerText = param;
			label.setAttribute("for", param);
			elem.appendChild(label);

			const input = document.createElement("input");
			input.id = param;
			input.name = param;
			input.type = param.indexOf("password") != -1 ? "password" : "text";
			input.value = params[param];
			input.addEventListener("change", () => {
				params[param] = input.value;
				window.api.params.set(param, input.value);
			});
			elem.appendChild(input);

			parameters.appendChild(elem);
		}
	}

	window.api.params.onGet((param: string, value: string) => {
		params[param] = value;

		if (parameters) {
			const input = document.getElementById(param) as HTMLInputElement;
			if (input) input.value = value;
		}
	});
});
