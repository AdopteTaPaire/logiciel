import { BrowserWindow, app } from "electron";
import Main from "./Main";

app.disableHardwareAcceleration();
Main.main(app, BrowserWindow);
