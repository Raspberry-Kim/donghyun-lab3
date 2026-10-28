# 동현빌™ v0.70: 데이터 계보와 모델의 경계

동현빌의 마을 사람 469명과 그들의 3일간 접촉은 실제 기록이다. 그 위에서 번지는 유행은 가상의 계산이다. 이 문서는 무엇을 어디서 가져왔고, 어떻게 바꾸었으며, 어디까지가 실험실의 가정인지 적는다.

## 원 데이터

- **이름:** Haslemere 데이터셋 (BBC Pandemic Haslemere app의 사용자 간 거리 기록)
- **공개 저장소:** [github.com/skissler/haslemere](https://github.com/skissler/haslemere) · 가져온 커밋 `dc49e83406bbd4788d0a5baeca6ceeba53241d7e`
- **기록 보관 항목:** [LSHTM Data Compass](https://datacompass.lshtm.ac.uk/id/eprint/2319/) (Kissler, Klepac, Tang, Conlan, Gog. 2020. skissler/haslemere [Dataset])
- **원 논문:** Kissler SM, Klepac P, Tang M, Conlan AJK, Gog JR. Sparking "The BBC Four Pandemic": Leveraging citizen science and mobile phones to model the spread of disease. bioRxiv 479154 (2018). [doi:10.1101/479154](https://doi.org/10.1101/479154)
- **다큐멘터리와 모델:** Klepac P, Kissler S, Gog J. Contagion! The BBC Four Pandemic – The model behind the documentary. Epidemics 2018;24:49–59. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29576516/)
- **같은 데이터를 쓴 후속 연구:** Firth JA 등. Using a real-world network to model localized COVID-19 control strategies. Nature Medicine 2020;26:1616–1622. [논문](https://www.nature.com/articles/s41591-020-1036-8)

가져온 파일과 SHA-256은 `data/village.json`의 `source` 항목과 `data/raw/`에 그대로 있다.

| 파일 | 내용 |
|---|---|
| `Kissler_DataS1.csv` | 102,831행. 열: 시간 단계(1~576), 사용자 A, 사용자 B(A<B), 거리(m, 반올림, 0~50). 50 m 이내였던 쌍만 기록 |
| `Kissler_DataS2.csv` | 시간 단계 576개와 실제 시각. 2017년 10월 12일(목) 07:00부터 14일(토) 22:55까지, 하루 07:00~22:55의 5분 간격 |
| `README-haslemere.md` | 원 저장소의 README |

원 연구진은 위치 자체는 사생활 보호를 위해 공개하지 않았고, 쌍별 거리만 공개했다. 사용자는 1~469의 번호다. 보조 자료에 따르면 거리는 GPS 오차를 포함하며 5분 안의 기록을 보간·반올림한 값이다. 동현빌은 이 숫자를 더 정확한 것으로 꾸미지 않는다.

## 변환 (`tools/build-village.cjs`)

1. 102,831행을 모두 검사한다(단계 1~576, 번호 1~469, A<B, 거리 0~50). 어긋나는 행이 있으면 빌드가 멈춘다.
2. 시간 단계별로 묶어 (A, B, 거리)를 3바이트씩 base64로 담는다. 손실은 없다. 앱은 이 배열을 그대로 읽어 계산한다.
3. 요약 통계를 낸다. 사흘 동안 한 사람이 만난 서로 다른 사람 수의 평균은 50 m 이내 35.3명, 20 m 이내 13.6명, 4 m 이내 5.4명이다. 4 m 이내 접촉이 한 번도 기록되지 않은 사람은 57명, 가장 많은 사람을 만난 330번은 4 m 이내에서 37명을 만났다.
4. 화면 배치를 계산한다. 20 m 이내 접촉망(가중치 Σexp(−d/10))의 힘 기반 배치를 구한 뒤, 가운데가 지나치게 빽빽하지 않도록 중심 거리를 순위에 따라 타원 안에 고르게 펴고, 4 m 이내에서 자주 만난 사이가 다시 가까워지도록 약하게 다듬는다. 최소 간격은 17px다. **이 배치는 그림을 위한 것이며 실제 위치가 아니고, 전파 계산에 쓰이지 않는다.**
5. 병원체별 전파 진폭 a를 보정한다(아래).

## 전파 모형

Kissler 등이 다큐멘터리 모의에 쓴 규칙을 따른다. 거리 d인 전염자-감수성자 쌍의 5분 단계 위험은 λ = a·exp(−d/ρ), 감수성자의 감염 확률은 1 − exp(−Σλ)다. ρ = 10 m는 그들의 값이다. 다큐멘터리 설정은 a = 1, 차단 거리 20 m, 감염 25분 뒤 전염, 감염 572단계(사흘) 뒤 회복이었고, 동현빌의 4번 병원체가 이것이다(회복은 사흘 뒤로 둔다).

홍역·백일해·인플루엔자는 다음과 같이 정했다.

| 병원체 | R₀ 목표 | 잠복기 | 전염 기간 | 백신 효과 | 근거 |
|---|---|---|---|---|---|
| 홍역 | 15 | 10일 | 8일 | 97% | R₀ 12~18의 가운데값([Guerra 등 2017, 체계적 고찰](https://pubmed.ncbi.nlm.nih.gov/28757186/)). 노출 뒤 발진까지 약 14일, 발진 4일 전부터 4일 후까지 전염, MMR 2회 접종 효과 약 97%([CDC Pink Book, Measles](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-13-measles.html)) |
| 백일해 | 5.5 | 8일 | 21일 | 85% | 유럽 5개국 자료의 R₀ 추정 5.5([Kretzschmar 등 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2889930/)). 잠복 7~10일, 치료 없이 기침 시작 뒤 약 3주 전염, 접종 효과 80~90%([CDC Pink Book, Pertussis](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-16-pertussis.html)) |
| 인플루엔자 | 1.3 | 1일 | 5일 | 50% | 계절 인플루엔자 R₀ 중앙값 1.28([Biggerstaff 등 2014, 체계적 고찰](https://pubmed.ncbi.nlm.nih.gov/25186370/)). 잠복 약 2일, 증상 하루 전부터 5~7일 전염, 백신 효과 40~60%([CDC Pink Book, Influenza](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html), [CDC, How Flu Spreads](https://www.cdc.gov/flu/spread/index.html)) |

**보정 방법.** 사흘치 기록에서 쌍 (i, j)마다 K_ij = Σ exp(−d/ρ)(50 m 이내 모든 기록)를 구한다. 전염 기간 D일 동안 사흘이 반복된다고 보면 j가 i를 감염시킬 확률은 1 − exp(−a·K_ij·D/3)이고, j의 기대 2차 감염 수는 이를 모든 i에 대해 더한 값이다. 469명 평균이 목표 R₀가 되는 a를 이분법으로 찾는다. 결과는 홍역 1.073, 백일해 0.046038, 인플루엔자 0.015929다.

**왜 50 m인가.** 20 m 이내에서만 전파가 가능하다고 두면 한 사람이 사흘 동안 만나는 사람이 평균 13.6명이라 어떤 a로도 평균 2차 감염 15명을 만들 수 없다. 공개 기록의 범위인 50 m까지를 쓰고 거리가 멀수록 위험을 지수적으로 줄였다. 50 m는 "같은 건물이나 거리에 있었다"의 대리 지표이지 병원체가 날아가는 거리가 아니다. 홍역이 실내 공기로 퍼진다는 사실과 어울리는 가정이지만, 측정된 값은 아니다. 백일해·인플루엔자에도 같은 차단 거리를 두어 병원체 간 차이가 a·잠복기·전염 기간·백신 효과에서만 나오게 했다.

**개인차는 없다.** 나이, 면역 상태, 증상의 정도, 계절, 접촉의 종류(대화·접촉·같은 방)는 모두 없다. 전염력은 전염 기간 내내 일정하다.

## 시간과 밤

하루는 288단계이며 07:00~22:55의 192단계에만 접촉이 있다. 밤 96단계에는 접촉이 없고 잠복기·전염 기간·격리 기간만 흐른다. 이것은 **집 안의 전파가 통째로 빠진다**는 뜻이다. 실제 유행에서 가정 내 전파는 큰 몫을 차지하므로, 동현빌의 유행은 실제보다 느리거나 작을 수 있다. 사흘치 기록을 되풀이하므로 주말·방학·계절의 변화도 없다.

## 접종과 격리의 단순화

- 접종은 효과(%)의 확률로 완전한 면역을 주고 나머지에는 아무 영향이 없는 "전부 아니면 전무" 모형이다. 접종 즉시 효과가 생긴다. 실제로는 면역이 생기기까지 시간이 걸리고, 부분 보호와 면역 감소가 있다.
- 예제 04번의 1회 접종 효과 93%와 2회 접종 효과 97%는 [미국 CDC의 MMR 백신 자료](https://www.cdc.gov/measles/vaccines/index.html)를 따른다. R₀ 15에서 집단면역 문턱은 면역 인구 1 − 1/15 ≈ 93%다.
- 예제 12·13번의 인플루엔자 백신 효과 60%(2010–11)와 19%(2014–15)는 [미국 CDC의 시즌별 백신 효과 추정치](https://www.cdc.gov/flu-vaccines-work/php/effectiveness-studies/past-seasons-estimates.html)다. 2010–11년 유행 바이러스는 대부분 백신 성분과 항원이 같았고([CDC 2010–11 시즌 요약](https://archive.cdc.gov/www_cdc_gov/flu/pastseasons/1011season.htm)), 2014–15년에는 H3N2 대부분이 백신주에서 항원 변이를 보였다([CDC 2014–15 시즌 요약](https://archive.cdc.gov/www_cdc_gov/flu/pastseasons/1415season.htm)). 접종 인원 220명(약 47%)은 2014–15년 미국 생후 6개월 이상 접종률 47.1%([CDC FluVaxView 2015–16 보고의 비교값](http://medbox.iiab.me/modules/en-cdc/www.cdc.gov/flu/fluvaxview/coverage-1516estimates.htm))를 두 해에 같이 적용한 값이다.
- 접종 규칙 2·4는 사흘간 4 m 이내 접촉 상대 수로 순서를 정한다. 실제 정책이 이런 순서를 알 수 있다는 뜻은 아니다.
- 격리 정책 1은 전염이 시작되고 하루 뒤에 격리한다. 홍역처럼 발진 전부터 전염되는 병에서는 이미 나흘 가까이 전염한 뒤일 수 있다는 점이 그대로 결과에 드러난다. 정책 2의 접촉자 격리 14일은 병원체와 무관한 고정값이며, 검사·추적의 지연과 누락은 없다.

## 확장 층의 근거 (예제 17~32)

병원체 6·7과 명령 14~28은 교과서와 시험의 숫자를 마을 위에 올려 보는 장치다. 아래 값 가운데 '가정'이라고 적은 것은 문헌의 직접 수치가 아니다.

**폐구균 풍토 보균 (병원체 6).**
- 보균 49일, 보균이 끝나면 곧바로 다시 감수성자. 보균 기간과 가구 내 전파는 [Melegaro 등 2004](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2870123/pdf/15188713.pdf)를 참고했다. 평균 재생산수 0.7은 바깥 유입과 함께 평균 보균율 5~10%가 되도록 맞춘 보정값이며 실제 R₀가 아니다.
- 침습도(보균 10만 건당 IPD 구분 없음 10, 백신형 20, 비백신형 5, X형 40)는 가정이다. 혈청형마다 침습도가 다르다는 점은 [혈청형별 침습도 연구](https://www.sciencedirect.com/science/article/pii/S1755436523000671)와 [Almeida 등](https://academic.oup.com/jid/article/223/9/1590/5900685)을 따랐다.
- PCV 효과 62%(예제 18)는 PCV의 백신형 보균 감소 범위([le Polain de Waroux 등 2015](https://journals.lww.com/pidj/fulltext/2015/08000/the_efficacy_and_duration_of_protection_of.15.aspx), [말라위 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC11056720/)), PPSV는 다당류 백신이 보균에 영향을 주지 않는다는 [CDC Pink Book](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-17-pneumococcal-disease.html)의 설명을 따랐다.
- 혈청형 대체(예제 19)는 [Simonsen 등](https://pmc.ncbi.nlm.nih.gov/articles/PMC3025524/), [Ladhani 등](https://pubmed.ncbi.nlm.nih.gov/29395999/), [유럽 10개국 자료](https://pmc.ncbi.nlm.nih.gov/articles/PMC8714201/), 형 사이 경쟁 [0.8 추정](https://link.springer.com/article/10.1186/1471-2334-13-180)을 참고했다. 마을에는 형 사이 경쟁이 없고, 빈자리는 유입 섞기로만 채워진다.
- 벨기에 19A(예제 20)는 [Emerging Infectious Diseases 보고](https://wwwnc.cdc.gov/eid/article/28/8/21-2440_article)를 따랐다.
- 바이러스 배수(예제 21)는 가정이다. 인플루엔자·RSV 뒤 폐구균 질환이 느는 관계는 [McCullers](https://pmc.ncbi.nlm.nih.gov/articles/PMC1539103/), [2024 medRxiv 연구](https://www.medrxiv.org/content/10.1101/2024.02.08.24302534v1), [Carrim 등](https://academic.oup.com/ofid/article/12/6/ofaf267/8154395)을 참고했다.
- 가상 아이의 보균 51일, 전파 30%, 바깥 획득 0.825%는 가정이다. 어린이집 보균은 [핀란드 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC2639357/)를 참고했다.

**RSV (병원체 7).**
- R₀ 3은 [R₀ 체계적 고찰](https://www.thelancet.com/journals/eclinm/article/PIIS2589-5370(25)00284-6/fulltext)의 범위 안에서 고른 값, 잠복 4일·전염 9일, 아기 전염 18일은 [Munywoki 등 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4411640/)와 [Hall 1991](https://pubmed.ncbi.nlm.nih.gov/2010624/)을 참고했다. 재감염은 [Hall 1991](https://pubmed.ncbi.nlm.nih.gov/2010624/)을 따랐다.
- 보호자↔아기 전파 26.8%·23.8%는 [Saravanos 등 가구 2차 발병률](https://onlinelibrary.wiley.com/doi/10.1111/irv.70270), 형제의 위험은 [JID 2021](https://academic.oup.com/jid/article/223/5/811/6044063), 가구 전파 구조는 [Munywoki 등 2014](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4017365/pdf/jit828.pdf)와 [케냐 가구 모형](https://pmc.ncbi.nlm.nih.gov/articles/PMC6543068/)을 참고했다.
- 아브리스보: MATISSE의 MA-LRTI 90일 57.1%(99.5% CI 14.7–79.8), 180일 51.3%(97.58% CI 29.4–66.8), 입원 90일 67.7%(99.17% CI 15.9–89.5), 180일 56.8%(10.1–80.7)([NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa2216480)). 접종→분만 14일 미만 효과 축소(32/82)는 [호주 예방접종 지침](https://immunisationhandbook.health.gov.au/contents/vaccine-preventable-diseases/respiratory-syncytial-virus-rsv)을 따랐다. 허가 범위는 [미국 라벨](https://labeling.pfizer.com/ShowLabeling.aspx?id=19589), [EMA](https://www.ema.europa.eu/en/documents/product-information/abrysvo-epar-product-information_en.pdf), [ACOG](https://www.acog.org/clinical-information/physician-faqs/maternal-rsv-vaccination), 국내 허가는 [연합뉴스 2026-08-14](https://www.yna.co.kr/view/AKR20260814086200017)를 참고했다.
- 베이포투스: MELODY 주 분석 MA-LRTI 74.5%(95% CI 49.6–87.1), 입원 62.1%(−8.6–86.8)([NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa2110275)). 전체 대상 입원 76.8%는 [AstraZeneca 발표](https://www.astrazeneca.com/media-centre/press-releases/2022/nirsevimab-significantly-protected-infants-against-rsv-disease-in-phase-iii-melody-trial.html), HARMONIE 83.2%는 [Sanofi 발표](https://www.sanofi.com/en/media-room/press-releases/2023/2023-05-12-08-50-00-2667568), 반감기 71일은 [FDA 라벨](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/761328s012lbl.pdf)이다.
- 엔플론시아: CLEVER MALRI 60.4%(95% CI 44.1–71.9), 입원 84.2%(66.6–92.6), 180일 LRI 입원 91.2%([NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa2502984)). MMWR은 LRTI 입원 90.9%로 적었다([MMWR](https://www.cdc.gov/mmwr/volumes/74/wr/mm7432a3.htm)). 반감기 44일은 [FDA 라벨](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/761432s000lbledt.pdf), 국내 허가는 [메디파나 2026-06](https://www.medipana.com/news/articleView.html?idxno=412416)를 참고했다.
- 세 제품의 직접 비교 시험은 없다([PMC 고찰](https://pmc.ncbi.nlm.nih.gov/articles/PMC13417266/)). 예제 29의 '같은 아기에 대어 본 값'은 서로 다른 시험의 숫자를 같은 감염에 적용한 계산이며 우열의 근거가 아니다.
- 관찰연구(예제 31): [Jabagi 등, JAMA 2026](https://pubmed.ncbi.nlm.nih.gov/41428474/)(저자 단서는 [Medscape](https://www.medscape.com/viewarticle/nirsevimab-may-top-maternal-shot-infants-rsv-prevention-2025a10010n2)), [Valtuille 등](https://www.santepubliquefrance.fr/en/node/39030), [HAS 의견](https://www.has-sante.fr/upload/docs/application/pdf/2026-07/dir8/abrysvo_femmes_enceintes_pic_reev_avisdef_ct21834.pdf).
- 실사용 근거(예제 28)는 [NIRSE-GAL](https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(24)00811-9/fulltext), 투여 시점은 [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2836755)과 [ACIP 경제성 자료](https://www.cdc.gov/acip/media/pdfs/2024/08/02-RSV-jones-508.pdf), 전파 감소 가정(예제 27)은 [Voirin 등](https://link.springer.com/article/10.1007/s40121-021-00566-9)을 참고했다.
- 점유율(예제 29~32): 한국은 2025년 베이포투스 단독 도입([대한소아감염학회 권고, Clin Exp Pediatr](https://pmc.ncbi.nlm.nih.gov/articles/PMC12488281/)), 아브리스보 허가 2026-08-13([연합뉴스](https://www.yna.co.kr/view/AKR20260814086200017))·11월 출시 예정([뉴스1](https://www.news1.kr/bio/pharmaceutical-bio/6332829)), 엔플론시아 합류([청년의사](http://www.docdocdoc.co.kr/news/articleView.html?idxno=3041293)), 국가예방접종 밖 자부담([아시아경제](https://www.asiae.co.kr/en/article/2026082704184127827), [데일리팜](https://m.dailypharm.com/user/news/3303), [디지털타임스](https://www.dt.co.kr/article/12070296)). 국내 접종률·점유율 공개 자료는 없어 베이포투스 45·엔플론시아 10·아브리스보 5·없음 40은 가정값이다. 영국형 65%는 2025년 11월 출생아 64.1%([UKHSA](https://www.gov.uk/government/news/rsv-maternal-vaccine-cuts-baby-hospital-admissions-by-up-to-85), 연구 기간 55.1%·28주부터 연중 접종은 [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13570235/))를 반올림했다. 미국형은 2026년 2월 보호 65.1%(산모 9.4%·항체주사 55.7%, [AAP 기술보고서](https://www.immunize.org/wp-content/uploads/official-guidance/AAP_RSV_Technical_Report_2026079049.pdf))이며, 4~9월 출생아의 산모 접종은 조사하지 않아 산모 몫이 낮게 잡힌다([CDC RSVVaxView](https://www.cdc.gov/rsvvaxview/dashboard/monoclonal-antibody-coverage-infants.html), 9~1월 계절 접종은 [CDC 지침](https://www.cdc.gov/vaccines-pregnancy/hcp/vaccination-guidelines/index.html), 뉴욕시 2024-25 산모 36.2%·니르세비맙 39.1%는 [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12910395/)). 미국 항체주사는 모두 베이포투스로 둔다.
- RSV 계절 10월~3월은 [대한소아청소년과학회 권고](https://pmc.ncbi.nlm.nih.gov/articles/PMC12488281/)와 [질병관리청](http://kdcanewsletter.or.kr/25102401), 투여 기준 창 10월 1일~3월 31일은 [CDC](https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html)를 따랐다. 코로나19 뒤의 어긋난 유행 시기는 [PMC 고찰](https://pmc.ncbi.nlm.nih.gov/articles/PMC12920030/)을 참고했다.
- 아브리스보 아기의 추가 항체주사(명령 21 값 2): 접종→분만 14일 미만은 [CDC](https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/infants-young-children.html)·[AAP](https://www.aap.org/en/patient-care/respiratory-syncytial-virus-rsv-prevention/rsv-frequently-asked-questions/), 4~9월 출생아의 계절 시작 투여는 [대한소아청소년과학회 권고](https://pmc.ncbi.nlm.nih.gov/articles/PMC12488281/)를 따랐다. 한국 권고는 임부 백신 도입 전에 나와 아브리스보 아기를 따로 다루지 않으며, 한국의 추가 투여 공식 권고는 찾지 못했다. 미국 산모 접종은 9~1월·32~36주([CDC](https://www.cdc.gov/vaccines-pregnancy/hcp/vaccination-guidelines/index.html)), 영국은 32주 미만 조산아·고위험아만 투여한다([Green Book](https://assets.publishing.service.gov.uk/media/6a2015a4730aece621f09866/Green_Book_RSV_20260603.pdf)). 두 제품을 함께 받은 효과는 근거가 없어 추가 투여일부터 베이포투스 값만 쓴다.
- 감염을 막는 몫, 효과 창 밖 0, 전파 감소율은 가정이다. 아기는 보호자 한 명과 밤에만 주고받으므로 아기에서 마을로 번지는 경로는 구조적으로 없다(예제 27의 0).

## 검증의 범위

- `qa/core-tests.cjs`는 데이터 무결성(행 수, 해시, 통계), 같은 시드의 재현성, 보정된 a에서의 평균 2차 감염 수, 명령 규약의 오류 처리, 예제 32개의 완주를 검사한다.
- 이것은 코드가 명세대로 동작하는지의 검사이지, 어떤 실제 유행을 예측하는 정확도의 검증이 아니다. 동현빌은 어떤 지역의 예측 도구도, 접종 정책 결정 도구도 아니다.

## 데이터 이용 조건

원 저장소의 README는 코드에 GPL-3을 명시하고 데이터 파일의 라이선스는 따로 적지 않았다. 원 논문과 후속 연구(Firth 등 2020)는 이 저장소를 공개 데이터로 안내하며, 여러 연구가 이 파일을 내려받아 사용했다. 동현빌은 데이터를 바꾸지 않고 담았고, 출처·저자·저장소·커밋을 함께 적는다. 데이터 자체에 동현빌의 라이선스를 씌우지 않으며, 재배포 조건은 원 저작자에게 있다. 앱 코드는 MIT, 글꼴은 SIL OFL이다. 자세한 것은 [CREDITS.md](CREDITS.md)와 [LICENSE](LICENSE)에 있다.
