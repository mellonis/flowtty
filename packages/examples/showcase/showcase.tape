# Records the self-playing showcase. The app drives itself (see script.ts), so
# this tape only opens a terminal of the right size, starts it, and waits.
#
#   brew install vhs          # once; pulls in ttyd and ffmpeg
#   npm run showcase:record   # from the repo root → docs/showcase.gif + .mp4
#
# The showcase draws in a fixed 100x30 frame. Width/Height/FontSize below give a
# terminal a little larger than that; if the recording shows the "needs a 100x30
# terminal" message instead, raise Width/Height or lower FontSize.

Output docs/showcase.gif
Output docs/showcase.mp4

Set Shell bash
Set FontSize 16
Set Width 1120
Set Height 720
Set Padding 16
Set Framerate 24
Set Theme "Dracula"

Hide
Type "clear" Enter
Show

Type "npm run showcase -- --exit" Sleep 400ms Enter

# The app prints this once it has quit and the normal screen is back.
Wait+Screen@180s /flowtty showcase finished/
Sleep 1s
