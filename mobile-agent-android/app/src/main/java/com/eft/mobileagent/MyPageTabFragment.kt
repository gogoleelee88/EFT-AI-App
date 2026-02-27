package com.eft.mobileagent

class MyPageTabFragment : LegacyMainTabFragment() {
    override val tabMode: MainTab = MainTab.MY_PAGE
    override val tabLayoutRes: Int = R.layout.fragment_my_page_tab
}
