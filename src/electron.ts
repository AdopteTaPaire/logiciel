import { BrowserWindow, app } from "electron";
import * as dotenv from "dotenv";
import Main from "./Main";

dotenv.config();
Main.main(app, BrowserWindow);
