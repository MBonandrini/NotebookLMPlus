@echo off
setlocal
title NotebookLMPlus - Ollama Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Ollama-For-NotebookLMPlus.ps1"
if errorlevel 1 (
  echo.
  echo Setup returned an error. Review the message above.
  pause
)
