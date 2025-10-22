# Change Log

All notable changes to the "tart-commenter" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

## [0.1.0] - 2025-08-19

### Changed

- Extension no longer spawns and uses dart analysis server to get AST of the dart file. Instead there's a custom .dart script as an exe file that reads it for the open file. 

## [0.1.1] - 2025-08-19

### Fixed

- Region of variable declarations now aren't being splitted by comment.
- Typo in the github link to repo fixed 

## [0.2.0] - 2025-10-19

### Added

- Add a command that generates currently open file. 

## [0.2.1] - 2025-10-22

### Fixed

- Fixed building files with build runner (after testing in production 😜). 