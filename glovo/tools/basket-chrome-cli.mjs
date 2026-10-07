#!/usr/bin/env node
import { main } from './basket-chrome.mjs';
main().catch(error => { console.error(error.message); process.exitCode = 1; });
