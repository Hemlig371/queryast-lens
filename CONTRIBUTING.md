# Development & Build Guide

### Prerequisites
* **Node.js**: v18.x or newer (LTS 20+ recommended)
* **npm**: v9.x+
* **Rust / Cargo** *(for Tauri Desktop target)*: with active toolchain
* **Android Studio / SDK** *(for Android Capacitor target)*

### Setup & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start web development server**:
   ```bash
   npm run dev
   ```
   *Default address:* `http://localhost:3000`

3. **Start desktop development mode (Tauri)**:
   ```bash
   npm run tauri dev
   ```

### Quality Assurance & Testing

* **TypeScript type check and linting**:
  ```bash
  npm run lint
  ```

* **Run test suite (Vitest)**:
  ```bash
  npx vitest run
  ```

### Build Commands

#### 1. Web / Full-Stack Output
```bash
npm run build
```
Compiles client SPA assets and server payload into the `dist/` folder.

Test production server execution:
```bash
npm run start
```

#### 2. Desktop Output (Tauri Native)
```bash
npm run tauri build
```
Built binaries (.dmg / .exe / .AppImage) are output to `src-tauri/target/release/bundle/`.

#### 3. Android Output (Capacitor)
```bash
npm run build

# Initial Android platform creation (if android folder does not exist yet):
npx cap add android

# Sync web assets and open project in Android Studio:
npx cap sync android
npx cap open android
```

# Руководство по развертыванию и сборке (RU)

### Требования к окружению
* **Node.js**: v18.x или новее (рекомендуется LTS 20+)
* **npm**: v9.x+
* **Rust / Cargo** *(для сборки Tauri Desktop)*: с установленным тулчейном `cargo`
* **Android Studio / SDK** *(для сборки Android Capacitor)*

### Развертывание и локальный запуск

1. **Установка зависимостей**:
   ```bash
   npm install
   ```

2. **Запуск веб-сервера разработки**:
   ```bash
   npm run dev
   ```
   *Порт по умолчанию:* `http://localhost:3000`

3. **Запуск десктоп-версии (Tauri Dev)**:
   ```bash
   npm run tauri dev
   ```

### Проверка кода и автотесты

* **Проверка типов TypeScript и линтинг**:
  ```bash
  npm run lint
  ```

* **Запуск тестового сюита (Vitest)**:
  ```bash
  npx vitest run
  ```

### Сборка приложения (Build Targets)

#### 1. Web / Full-Stack
```bash
npm run build
```
Сборка статических файлов клиентского приложения и сервера в директорию `dist/`.

Проверка продакшн-запуска:
```bash
npm run start
```

#### 2. Desktop (Tauri Native Package)
```bash
npm run tauri build
```
Результаты сборки (.dmg / .exe / .AppImage) сохраняются в `src-tauri/target/release/bundle/`.

#### 3. Android (Capacitor)
```bash
npm run build

# Первоначальная инициализация Android платформы (если папка android еще не создана):
npx cap add android

# Синхронизация ассетов и открытие проекта в Android Studio:
npx cap sync android
npx cap open android
```
