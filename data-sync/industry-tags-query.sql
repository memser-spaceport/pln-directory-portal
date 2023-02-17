SELECT it.*, ic.title AS categoryTtitle
	FROM public."IndustryTag" AS it
	LEFT JOIN public."IndustryCategory" AS ic
	ON it."industryCategoryUid" = ic.uid
