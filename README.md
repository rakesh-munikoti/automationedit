# 🎬 Video Editor - Modern Web-Based Video Editing Tool

A professional, user-friendly video editing website built with React and TypeScript. Edit your videos directly in your browser with ease!

## Features

✨ **Video Editing Capabilities:**
- **Trim & Cut** - Trim videos to specific time ranges
- **Speed Control** - Adjust playback speed (0.25x - 2x)
- **Effects & Filters** - Apply brightness, contrast, and saturation adjustments
- **Text Overlays** - Add multiple text overlays with custom timing
- **Background Audio** - Add audio tracks to your videos
- **Real-time Preview** - See your edits instantly

## Getting Started

### Prerequisites
- Node.js 16+ and npm installed
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser:**
   - The app will run at `http://localhost:5173/`
   - It should open automatically

## How to Use

### 1. **Upload a Video**
   - Click the upload box or drag & drop a video file
   - Supported formats: MP4, WebM, Ogg, and more

### 2. **Preview & Control**
   - Use the video player to preview your edits
   - Click Play or Pause buttons
   - Drag the timeline to jump to specific moments

### 3. **Edit Your Video**

   #### Speed Control
   - Adjust slider (0.25x to 2x)
   - Use quick preset buttons (0.5x, 1x, 1.5x, 2x)

   #### Visual Effects
   - **Brightness**: 0% - 200%
   - **Contrast**: 0% - 200%
   - **Saturation**: 0% - 200%

   #### Trim Your Video
   - **Trim Start**: Mark the beginning
   - **Trim End**: Mark the end

   #### Add Text Overlays
   - Click "Add Text" button
   - Enter text content
   - Set when text appears (time in seconds)
   - Set visibility duration

   #### Add Background Audio
   - Select an audio file (MP3, WAV, etc.)

### 4. **Export Your Edited Video**
   - Click "Export Video"
   - Your edited video will download

### 5. **Start Over**
   - Click "Start Over" to reset

## Project Structure

```
src/
├── components/
│   ├── VideoPlayer.tsx      # Video display with filters
│   ├── Timeline.tsx         # Timeline editor
│   └── EffectsPanel.tsx     # Effects and overlays
├── App.tsx                   # Main application
├── App.css                   # App styling
└── index.css                 # Global styles
```

## Available Scripts

```bash
npm run dev       # Development server
npm run build     # Build for production
npm run preview   # Preview production build
```

## Browser Compatibility

- ✅ Chrome/Edge (Latest)
- ✅ Firefox (Latest)
- ✅ Safari (Latest)

## Tips

- For best performance, keep videos under 500MB
- Video is processed in real-time
- Exported videos maintain original quality

## Troubleshooting

**Video won't load:**
- Check if the format is supported
- Try a different browser
- Clear browser cache

**Effects not showing:**
- Refresh the page
- Ensure video is fully loaded

**Export not working:**
- Check download settings
- Try a different video format

## Future Features

- [ ] Video merging
- [ ] Custom filters and transitions
- [ ] 3D effects
- [ ] Watermark support
- [ ] Cloud backup
- [ ] Advanced color grading

## Built with

React • TypeScript • Vite • Tailwind CSS

---

**Happy editing! 🎥✨**
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
