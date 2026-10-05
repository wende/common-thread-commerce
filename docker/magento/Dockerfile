FROM php:8.4-apache@sha256:75325cceea4f9a8200f4e9e146e8155ec1b6466b2957b87accf0286b94547cbd
RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip curl libicu-dev libzip-dev libxslt1-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev libonig-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j4 bcmath ftp gd intl pdo_mysql soap sockets xsl zip opcache \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac /usr/bin/composer /usr/local/bin/composer
COPY composer.json composer.lock /opt/magento-project/
RUN printf 'memory_limit=2G\nmax_execution_time=600\nrealpath_cache_size=10M\nrealpath_cache_ttl=7200\n' > /usr/local/etc/php/conf.d/magento.ini
RUN sed -i 's|DocumentRoot /var/www/html|DocumentRoot /var/www/html/pub|' /etc/apache2/sites-available/000-default.conf \
    && printf '<Directory /var/www/html>\nAllowOverride All\nRequire all granted\n</Directory>\n' > /etc/apache2/conf-available/magento.conf \
    && a2enconf magento
WORKDIR /var/www/html
