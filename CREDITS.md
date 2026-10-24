# 동현빌™: 전체 출처·가공 내역·이용 안내

동현빌은 실제 접촉 기록 위에서 가상의 유행을 돌려 보는 교육용 장난감이다. 여기서 쓴 데이터, 참고한 문헌, 새로 만든 부분과 이용 조건을 한곳에 모았다.

## 공개 접촉 기록

- **Haslemere 데이터셋** — Stephen M. Kissler, Petra Klepac, Maria Tang, Andrew J. K. Conlan, Julia R. Gog. [github.com/skissler/haslemere](https://github.com/skissler/haslemere) (커밋 `dc49e83`), [LSHTM Data Compass 기록](https://datacompass.lshtm.ac.uk/id/eprint/2319/).
- 2017년 10월 12~14일 영국 Haslemere에서 BBC Pandemic 앱 사용자 469명 사이의 5분 간격 거리(50 m 이내)를 담은 102,831행과 시간표. 이 실험은 2018년 3월 22일 방송된 BBC Four 다큐멘터리 「Contagion! The BBC Four Pandemic」을 위한 시민 과학 프로젝트였다.
- 원 논문: Kissler SM 등. Sparking "The BBC Four Pandemic". bioRxiv 479154 (2018). [doi:10.1101/479154](https://doi.org/10.1101/479154). 다큐멘터리 모델: Klepac P, Kissler S, Gog J. Epidemics 2018;24:49–59. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29576516/).
- 동현빌은 두 CSV를 `data/raw/`에 그대로 두고, `tools/build-village.cjs`로 손실 없이 압축해 `data/village.json`에 담았다. 거리 값, 사람 번호, 시간 단계는 바꾸지 않았다.
- 참가자들은 번호로만 남아 있고 위치는 공개되지 않았다. 동현빌도 누구인지 알 수 없으며, 화면의 자리는 계산한 배치일 뿐이다.

## 병원체 숫자의 출처

- 홍역: Guerra FM 등. The basic reproduction number (R0) of measles: a systematic review. Lancet Infect Dis 2017. [PubMed](https://pubmed.ncbi.nlm.nih.gov/28757186/) · [CDC Pink Book, Measles](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-13-measles.html)
- 백일해: Kretzschmar M, Teunis PFM, Pebody RG. Incidence and reproduction numbers of pertussis. PLoS Med 2010. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2889930/) · [CDC Pink Book, Pertussis](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-16-pertussis.html)
- 인플루엔자: Biggerstaff M 등. Estimates of the reproduction number for seasonal, pandemic, and zoonotic influenza: a systematic review. BMC Infect Dis 2014. [PubMed](https://pubmed.ncbi.nlm.nih.gov/25186370/) · [CDC Pink Book, Influenza](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html) · [CDC, How Flu Spreads](https://www.cdc.gov/flu/spread/index.html)
- 접촉망 위의 유행 모의와 접촉자 추적: Firth JA 등. Using a real-world network to model localized COVID-19 control strategies. Nat Med 2020. [논문](https://www.nature.com/articles/s41591-020-1036-8)

문헌의 값은 범위로 보고되며, 동현빌은 그 가운데 한 값을 골라 고정했다. 어떤 값을 왜 골랐는지는 [PROVENANCE.md](PROVENANCE.md)에 있다. 논문 본문과 그림은 다시 싣지 않고 인용만 한다.

## 동현빌이 새로 만든 것

- 사흘치 기록을 되풀이하며 밤을 건너뛰는 시간 구조, 거리 가중 전파 규칙의 병원체별 보정, "전부 아니면 전무" 접종, 두 단계 격리 정책, 관측 항목 — 모두 동현빌의 모델 가정이다.
- 마을 그림(배치, 색, 길, 하늘, 불꽃과 물결), 유행 곡선, 동현랭 명령 규약, 예제 13개, 문서.
- 동현랭 실행기(`src/donghyun.js`)는 [동현랭 저장소](https://github.com/Raspberry-Kim/donghyun-lang)의 v1.52를 고치지 않고 썼다.

## 이용 조건

- **접촉 기록 데이터:** 원 저장소 README는 코드에 GPL-3을 명시하고 데이터 파일의 조건은 적지 않았다. 원 논문과 후속 연구는 이 저장소를 공개 데이터로 안내한다. 동현빌은 데이터를 출처와 함께 변경 없이 담았으며, 데이터에 별도 라이선스를 부여하지 않는다. 데이터를 다시 쓸 때는 원 저작자(Kissler 등)와 저장소를 밝혀라.
- **앱 코드·문서·그림:** MIT ([LICENSE](LICENSE)). 저작권 © 2026 김동현.
- **동현랭 실행기:** MIT ([licenses/DONGHYUN-MIT.txt](licenses/DONGHYUN-MIT.txt)).
- **글꼴:** Black Han Sans, Nanum Gothic Coding, Pretendard — SIL Open Font License 1.1 ([licenses](licenses/)).
- **빌드 도구:** Marked 15.0.12 — MIT ([licenses/MARKED-MIT.txt](licenses/MARKED-MIT.txt)). 배포 파일에는 들어가지 않는다.

## 이것이 아닌 것

동현빌은 Haslemere나 다른 어떤 지역의 유행 예측이 아니다. 접종 정책이나 격리 정책을 결정하는 도구도 아니다. 실제로 기록된 469명의 3일간 접촉 기반 위에서, 교과서의 숫자들이 어떻게 움직이는지 손으로 만져 보는 비상업적 교육용 모형이다. 만든 사람은 인하대학교 의과대학 김동현 교수(소아감염·백신학)이며, 이 실험실의 모든 단순화는 만든 사람의 선택이고 원 연구진과 무관하다.
