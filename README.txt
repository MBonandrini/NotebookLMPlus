NotebookLMPlus - One-Click Ollama Setup
======================================

Windows quick setup
-------------------
1. Install Ollama and launch it once.
2. Double-click Run-Ollama-Setup.bat.
3. The script automatically trusts the NotebookLMPlus GitHub Pages origin.
4. Optionally let it download qwen3:4b and embeddinggemma.
5. It restarts Ollama and tests the local API and browser-origin/CORS response.

Default site
------------
https://MBonandrini.github.io/NotebookLMPlus/

Security
--------
The script adds the exact GitHub Pages origin and deliberately does not configure OLLAMA_ORIGINS=*. Existing origin entries are preserved.

Custom domain / alternate deployment
------------------------------------
Run PowerShell manually and provide -SiteUrl:

  .\Setup-Ollama-For-NotebookLMPlus.ps1 -SiteUrl "https://example.com/NotebookLMPlus/"

Optional unattended model installation:

  .\Setup-Ollama-For-NotebookLMPlus.ps1 -InstallModels
