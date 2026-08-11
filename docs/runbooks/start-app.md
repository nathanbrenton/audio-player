# Start Hiplingo locally

```sh
cd ~/Desktop/record-label/audio-player || exit 1;
npm run dev;
```

Navigate to:

```text
http://127.0.0.1:5173/
```

The default development media source is the sibling public-safe directory:

```text
../published-media
```

For temporary fixture/testing use only, override the media root explicitly:

```sh
MEDIA_LIBRARY_ROOT=../some-test-media npm run dev;
```
