# TFT 모바일 APK 빌드

원본과 마또 모바일 사이트를 각각 여는 Android 앱입니다. 사이트는 공개되어 있어 앱 사용에 로그인이 필요하지 않습니다. 화면과 추천 덱은 사이트에서 갱신됩니다. 인터넷 연결이 필요합니다.

## GitHub에서 APK 만들기

1. GitHub에서 **Public** 저장소를 만듭니다. 이 폴더의 파일과 `.github/workflows/build-apk.yml`을 저장소 루트에 올립니다.
2. **Actions → Build Android APKs → Run workflow**를 실행합니다. `main` 브랜치에 올릴 때도 자동 실행됩니다.
3. 빌드 성공 후 저장소의 **Releases → TFT 모바일 앱**에서 `app-original-debug.apk`와 `app-matto-debug.apk`를 내려받습니다. 공개 저장소의 Release 파일은 앱 사용자에게 GitHub 로그인을 요구하지 않습니다.

두 앱은 서로 다른 패키지 이름으로 함께 설치됩니다. Android 10 이상을 지원합니다. APK를 설치할 때 휴대폰에서 해당 다운로드 출처의 설치를 허용해야 할 수 있습니다.

**서명 및 업데이트:** 이 첫 빌드는 GitHub의 임시 디버그 서명으로 만들어집니다. 빌드마다 서명키가 바뀔 수 있어 새 APK를 기존 앱 위에 업데이트하지 못할 수 있습니다. 기존 앱에서 작업 파일을 저장한 뒤 앱을 삭제하고 새 APK를 설치해야 합니다. 장기적으로 덮어쓰기 업데이트가 필요하면 개인 서명키를 안전하게 GitHub Secrets에 저장하고 Release 빌드로 전환해야 합니다.

개발자 참고: Android Gradle Plugin 8.7.3, Gradle 8.10.2, JDK 17, Android SDK 35를 사용합니다. 앱의 공개 URL은 `app/build.gradle`의 각 flavor에 있습니다.

## 추천 덱 자동 갱신

앱은 공개 `data/latest.json`을 실행할 때 확인합니다. `.github/workflows/refresh.yml`은 한국 시간 매주 목요일 오전 6시에 출처를 확인하고, 검증된 부분만 갱신합니다. GitHub Actions가 지연될 수 있으며 수집이 차단된 사이트는 이전 확인값을 유지합니다. `Actions → Refresh TFT deck data`에서 실행 결과와 출처별 상태를 확인할 수 있습니다. 이 작업은 ChatGPT 대화 예약과 별개입니다.
