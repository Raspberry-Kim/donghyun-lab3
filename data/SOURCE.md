# Haslemere 데이터셋 (BBC Pandemic Haslemere app)

- 저장소: https://github.com/skissler/haslemere · 커밋 `dc49e83406bbd4788d0a5baeca6ceeba53241d7e`
- 저자: Stephen M. Kissler, Petra Klepac, Maria Tang, Andrew J. K. Conlan, Julia R. Gog
- 논문: Sparking "The BBC Four Pandemic": Leveraging citizen science and mobile phones to model the spread of disease. bioRxiv 479154 (2018). https://doi.org/10.1101/479154
- 보관 기록: LSHTM Data Compass, https://datacompass.lshtm.ac.uk/id/eprint/2319/

## 파일

| 파일 | 내용 |
|---|---|
| `raw/Kissler_DataS1.csv` | 102,831행. 시간 단계, 사용자 A, 사용자 B, 거리(m). 50 m 이내였던 쌍만 |
| `raw/Kissler_DataS2.csv` | 시간 단계 1~576과 실제 시각 (2017-10-12 07:00 ~ 2017-10-14 22:55 BST, 5분 간격, 하루 07:00~22:55) |
| `raw/README-haslemere.md` | 원 저장소 README (코드 GPL-3 명시, 데이터 파일 라이선스는 적혀 있지 않음) |
| `village.json` | `tools/build-village.cjs`가 만든 앱용 파일. 손실 없는 압축 기록, 화면 배치, 접촉 수 요약, 병원체 설정과 보정값, 원 파일의 SHA-256 |

원 파일은 변경 없음. 다시 만들려면 `npm run data`.
